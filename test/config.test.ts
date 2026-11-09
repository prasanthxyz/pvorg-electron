import { readdirSync, statSync, writeFileSync } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
import {
  atomicWriteFile,
  ConfigError,
  defaultConfigPath,
  loadConfig,
  normalizeRelations,
  saveConfig,
  serializeConfig
} from '../src/main/library/config'
import { scratch, TestLibrary } from './helpers'

describe('config location (§1.1)', () => {
  it('defaults to ~/pvorg.json', () => {
    expect(defaultConfigPath({})).toBe(path.join(os.homedir(), 'pvorg.json'))
  })

  it('honours PVORG_CONFIG, expanding ~', () => {
    expect(defaultConfigPath({ PVORG_CONFIG: '/tmp/x/pvorg.json' })).toBe(
      path.resolve('/tmp/x/pvorg.json')
    )
    expect(defaultConfigPath({ PVORG_CONFIG: '~/lib/pvorg.json' })).toBe(
      path.join(os.homedir(), 'lib/pvorg.json')
    )
  })
})

describe('loading (§1.2, §6.7)', () => {
  it('names a missing file', async () => {
    await expect(loadConfig(path.join(scratch(), 'pvorg.json'))).rejects.toThrow(
      new ConfigError('The file “pvorg.json” couldn’t be found.')
    )
  })

  it('reports invalid JSON', async () => {
    const lib = new TestLibrary().writeRaw('{ "videosPath": ')
    await expect(loadConfig(lib.config)).rejects.toThrow(/pvorg.json isn’t valid JSON/)
  })

  it('names a missing required key', async () => {
    const lib = new TestLibrary().writeRaw(JSON.stringify({ videosPath: '/v', tags: [] }))
    await expect(loadConfig(lib.config)).rejects.toThrow(
      'pvorg.json isn’t valid: the required key “galleriesPath” is missing.'
    )
  })

  it('names the offending path for a wrong type', async () => {
    const lib = new TestLibrary().writeConfig({
      videoRelations: { 'a-b-c.mp4': { tags: 'oops' } }
    })
    await expect(loadConfig(lib.config)).rejects.toThrow(
      '“videoRelations.a-b-c.mp4.tags” must be a list of strings.'
    )
  })

  it('reads null arrays as missing', async () => {
    const lib = new TestLibrary().writeConfig({
      videoRelations: { 'a-b-c.mp4': { galleries: null, tags: ['x'] } }
    })
    const config = await loadConfig(lib.config)
    expect(config.videoRelations['a-b-c.mp4']).toEqual({ tags: ['x'] })
  })
})

describe('normalization (§1.2)', () => {
  it('turns missing arrays into [] and counts changed relations', async () => {
    const lib = new TestLibrary().writeConfig({
      videoRelations: {
        'a-b-c.mp4': { galleries: ['G'] },
        'd-e-f.mp4': { galleries: [], excludedGalleries: [], tags: [], excludedTags: [] }
      }
    })
    const config = await loadConfig(lib.config)
    expect(normalizeRelations(config)).toBe(1)
    expect(config.videoRelations['a-b-c.mp4']).toEqual({
      galleries: ['G'],
      excludedGalleries: [],
      tags: [],
      excludedTags: []
    })
    expect(normalizeRelations(config)).toBe(0)
  })

  it('saves at startup only when something changed', async () => {
    const lib = new TestLibrary().addVideo('a-b-c.mp4')
    const canonical =
      serializeConfig({
        videosPath: lib.videos,
        galleriesPath: lib.galleries,
        tags: [],
        videoRelations: {
          'a-b-c.mp4': { galleries: [], excludedGalleries: [], tags: [], excludedTags: [] }
        }
      }).replace(/\n$/, '') + '  \n' // non-canonical whitespace survives when nothing changes
    lib.writeRaw(canonical)
    await lib.open()
    expect(lib.text()).toBe(canonical)

    lib.writeConfig({ tags: [], videoRelations: { 'a-b-c.mp4': { tags: ['x'] } } })
    await lib.open()
    expect(lib.read().videoRelations).toEqual({
      'a-b-c.mp4': { galleries: [], excludedGalleries: [], tags: ['x'], excludedTags: [] }
    })
  })
})

describe('writing (§1.2)', () => {
  it('pretty-prints with sorted keys and a trailing newline, dropping unknown keys', async () => {
    const lib = new TestLibrary().writeRaw(
      JSON.stringify({
        videoRelations: { 'z-z-z.mp4': { tags: ['b'], galleries: ['Café'] }, 'a-a-a.mp4': {} },
        tags: ['b', 'a'],
        notes: 'unknown',
        videosPath: '/v',
        galleriesPath: '/g'
      })
    )
    const config = await loadConfig(lib.config)
    await saveConfig(config, lib.config)
    expect(lib.text()).toBe(
      [
        '{',
        '  "galleriesPath": "/g",',
        '  "tags": [',
        '    "b",',
        '    "a"',
        '  ],',
        '  "videoRelations": {',
        '    "a-a-a.mp4": {},',
        '    "z-z-z.mp4": {',
        '      "galleries": [',
        '        "Café"',
        '      ],',
        '      "tags": [',
        '        "b"',
        '      ]',
        '    }',
        '  },',
        '  "videosPath": "/v"',
        '}',
        ''
      ].join('\n')
    )
  })

  it('writes atomically, leaving no temporary files', async () => {
    const dir = scratch()
    const file = path.join(dir, 'pvorg.json')
    writeFileSync(file, 'old')
    const before = statSync(file).ino
    await atomicWriteFile(file, 'new\n')
    expect(readdirSync(dir)).toEqual(['pvorg.json'])
    expect(statSync(file).ino).not.toBe(before) // replaced by rename, not rewritten in place
  })
})
