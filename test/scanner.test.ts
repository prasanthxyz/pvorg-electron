import { mkdirSync, writeFileSync } from 'fs'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/main/library/config'
import { compareLabels, credits, fold, humanize, joinList } from '../src/main/library/display'
import {
  parseVideoFilename,
  scanGalleries,
  scanVideos,
  validateVideoFilename
} from '../src/main/library/scanner'
import { TestLibrary } from './helpers'

describe('filenames (§1.3)', () => {
  it('accepts studio-cast-title names', () => {
    expect(validateVideoFilename('acme-jane_doe-harbor_lights.mp4')).toEqual([])
    expect(parseVideoFilename('acme-jane_doe-john_roe-mountain_pass.mp4')).toEqual({
      studio: 'acme',
      cast: ['jane_doe', 'john_roe'],
      title: 'mountain_pass'
    })
  })

  it('gives every reason a name is skipped', () => {
    expect(validateVideoFilename('Bad Name.mp4')).toEqual([
      'Contains uppercase characters',
      'Contains spaces',
      'Fewer than 3 dash-separated parts (need studio-cast-title)'
    ])
    expect(validateVideoFilename('nodashes.mp4')).toEqual([
      'Fewer than 3 dash-separated parts (need studio-cast-title)'
    ])
  })

  it('scans valid videos sorted by humanized title, reporting skipped ones', async () => {
    const lib = new TestLibrary()
      .addVideo('acme-jane_doe-zebra.mp4')
      .addVideo('globex-sam-apple.MKV') // uppercase extension: skipped for its name
      .addVideo('initech-li-banana.webm')
      .addVideo('hooli-x-Éclair.mov')
      .addVideo('.hidden-a-b.mp4')
      .addVideo('vandelay-a-notes.txt')
      .addVideo('Bad Name.mp4')
      .writeConfig({ videoRelations: { 'acme-jane_doe-zebra.mp4': { tags: ['night'] } } })
    mkdirSync(path.join(lib.videos, 'folder-a-b.mp4'))
    const config = await loadConfig(lib.config)
    const { videos, skipped } = await scanVideos(config, ['G'])
    expect(videos.map((v) => v.filename)).toEqual([
      'initech-li-banana.webm',
      'acme-jane_doe-zebra.mp4'
    ])
    expect(skipped.map((s) => s.filename)).toEqual([
      'Bad Name.mp4',
      'globex-sam-apple.MKV',
      'hooli-x-Éclair.mov'
    ])
    const zebra = videos[1]
    expect(zebra.displayTitle).toBe('Zebra')
    expect(zebra.credits).toBe('Acme · Jane Doe')
    expect(zebra.tags).toEqual(['night'])
    expect(zebra.relatedGalleries).toEqual(['G'])
  })

  it('returns nothing for a missing videos folder', async () => {
    const lib = new TestLibrary().writeConfig({ videosPath: '/nonexistent/pvorg-videos' })
    expect(await scanVideos(await loadConfig(lib.config), [])).toEqual({ videos: [], skipped: [] })
  })
})

describe('galleries (§1.4)', () => {
  it('lists subfolders with their images sorted by filename', async () => {
    const lib = new TestLibrary().addGallery('Beach Days', 0).addGallery('.hidden', 1)
    const folder = path.join(lib.galleries, 'Beach Days')
    for (const name of ['b.PNG', 'a.jpeg', 'c.gif', 'd.bmp', 'e.txt', '.f.jpg', 'g.webp']) {
      writeFileSync(path.join(folder, name), '')
    }
    mkdirSync(path.join(lib.galleries, 'Empty'))
    writeFileSync(path.join(lib.galleries, 'loose.jpg'), '')
    const galleries = await scanGalleries(lib.galleries)
    expect(galleries.map((g) => g.name)).toEqual(['Beach Days', 'Empty'])
    expect(galleries[0].images.map((i) => path.basename(i))).toEqual([
      'a.jpeg',
      'b.PNG',
      'c.gif',
      'd.bmp'
    ])
    expect(galleries[1].images).toEqual([])
  })
})

describe('presentation (§2)', () => {
  it('humanizes names and formats credits', () => {
    expect(humanize('jane_doe')).toBe('Jane Doe')
    expect(humanize('a_very__long_title')).toBe('A Very Long Title')
    expect(joinList(['A', 'B'])).toBe('A and B')
    expect(credits('acme', ['jane_doe', 'john_roe'])).toBe('Acme · Jane Doe and John Roe')
    expect(credits('acme', [])).toBe('Acme')
  })

  it('folds case and diacritics for search', () => {
    expect(fold('Éclair Café')).toBe('eclair cafe')
  })

  it('sorts labels ignoring case', () => {
    expect(['b', 'A', 'c', 'á'].sort(compareLabels)).toEqual(['A', 'á', 'b', 'c'])
  })
})
