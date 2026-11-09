import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
import { baseName, ImportError, parseOldLibrary } from '../src/main/library/importer'
import { TestLibrary } from './helpers'

const SAMPLE = path.join(__dirname, 'fixtures', 'pvorg.yml')

function library(relations: Record<string, unknown> = {}): TestLibrary {
  const lib = new TestLibrary()
    .addVideo('acme-jane_doe-harbor_lights.mp4')
    .addVideo('globex-sam_lee-desert_road.mp4')
    .addVideo('initech-alex_kim-golden_hour.mkv')
    .addVideo('Bad Name.mp4')
    .addGallery('Beach Days')
    .addGallery('City Lights')
    .addGallery('Portraits')
    .addGallery('Wildlife')
  lib.writeConfig({
    tags: ['4k', 'travel'],
    videoRelations: {
      'acme-jane_doe-harbor_lights.mp4': { excludedGalleries: ['City Lights'] },
      ...relations
    }
  })
  copyFileSync(SAMPLE, path.join(lib.root, 'pvorg.yml'))
  return lib
}

describe('parsing pvorg.yml', () => {
  it('reads the old library shape', () => {
    const old = parseOldLibrary(readFileSync(SAMPLE, 'utf8'))
    expect(old.videos).toHaveLength(5)
    expect(old.videos[1]).toBe('D:\\Videos\\globex-sam_lee-desert_road.mp4')
    expect(old.galleries).toHaveLength(4)
    expect(old.videoGalleries[0]).toEqual([
      '/Users/prasanth/Videos/acme-jane_doe-harbor_lights.mp4',
      '/Users/prasanth/Pictures/galleries/Beach Days'
    ])
  })

  it('takes base names from POSIX and Windows paths', () => {
    expect(baseName('/a/b/Portraits/')).toBe('Portraits')
    expect(baseName('D:\\Videos\\x-y-z.mp4')).toBe('x-y-z.mp4')
  })

  it('rejects files that aren’t a pvorg library', () => {
    expect(() => parseOldLibrary('just: text')).toThrow(ImportError)
    expect(() => parseOldLibrary('videos: [1, 2]')).toThrow(/can’t read/)
    expect(() => parseOldLibrary('videoTags: [[a]]')).toThrow(/pairs/)
    expect(() => parseOldLibrary('videos: [unclosed')).toThrow(/isn’t valid YAML/)
  })
})

describe('import (§3.10)', () => {
  it('previews without writing anything', async () => {
    const lib = library()
    const libraryState = await lib.open()
    const before = lib.text()
    const mtime = statSync(lib.config).mtimeMs
    const plan = await libraryState.importPreview(path.join(lib.root, 'pvorg.yml'))
    expect(lib.text()).toBe(before)
    expect(statSync(lib.config).mtimeMs).toBe(mtime)

    expect(plan.matchedVideos).toEqual([
      {
        filename: 'globex-sam_lee-desert_road.mp4',
        title: 'Desert Road',
        galleriesYes: 1,
        galleriesNo: 2,
        tags: ['night']
      },
      {
        filename: 'initech-alex_kim-golden_hour.mkv',
        title: 'Golden Hour',
        galleriesYes: 0,
        galleriesNo: 3,
        tags: ['drone']
      },
      {
        filename: 'acme-jane_doe-harbor_lights.mp4',
        title: 'Harbor Lights',
        galleriesYes: 2,
        galleriesNo: 1,
        tags: ['outdoor', 'travel']
      }
    ])
    expect(plan.unmatchedVideos).toEqual([
      {
        path: '/Users/prasanth/Videos/Bad Name.mp4',
        reason: 'In the videos folder, but its name doesn’t follow studio-cast-title'
      },
      {
        path: '/Users/prasanth/Videos/oldstudio-someone-missing_clip.mp4',
        reason: 'Not in the videos folder'
      }
    ])
    expect(plan.matchedGalleries).toEqual(['Beach Days', 'City Lights', 'Portraits'])
    expect(plan.unmatchedGalleries).toEqual(['/Users/prasanth/Pictures/galleries/Old Trip'])
    expect(plan.tagsToAdd).toEqual(['outdoor', 'night', 'drone'])
    expect(plan.decisionCount).toBe(12)
    expect(plan.keptCount).toBe(1)
  })

  it('maps pairs to Yes, missing gallery pairs to No, and keeps existing decisions', async () => {
    const lib = library()
    const libraryState = await lib.open()
    await libraryState.importApply(path.join(lib.root, 'pvorg.yml'))
    expect(lib.read()).toEqual({
      videosPath: lib.videos,
      galleriesPath: lib.galleries,
      tags: ['4k', 'travel', 'outdoor', 'night', 'drone'],
      videoRelations: {
        'acme-jane_doe-harbor_lights.mp4': {
          galleries: ['Beach Days'],
          excludedGalleries: ['City Lights', 'Portraits'],
          tags: ['outdoor', 'travel'],
          excludedTags: []
        },
        'globex-sam_lee-desert_road.mp4': {
          galleries: ['Portraits'],
          excludedGalleries: ['Beach Days', 'City Lights'],
          tags: ['night'],
          excludedTags: []
        },
        'initech-alex_kim-golden_hour.mkv': {
          galleries: [],
          excludedGalleries: ['Beach Days', 'City Lights', 'Portraits'],
          tags: ['drone'],
          excludedTags: []
        }
      }
    })
    // Rescanned: the new decisions drive the combinations.
    expect(libraryState.allTags()).toEqual(['4k', 'drone', 'night', 'outdoor', 'travel'])
    expect(
      libraryState.combinations
        .filter((c) => c.video.filename.startsWith('initech'))
        .map((c) => c.gallery.name)
    ).toEqual(['Wildlife'])
  })

  it('never touches files, and a second import changes nothing', async () => {
    const lib = library()
    const libraryState = await lib.open()
    const listing = (): string[][] => [
      readdirSync(lib.videos).sort(),
      readdirSync(lib.galleries).sort()
    ]
    const files = listing()
    await libraryState.importApply(path.join(lib.root, 'pvorg.yml'))
    expect(listing()).toEqual(files)
    const after = lib.text()
    const again = await libraryState.importPreview(path.join(lib.root, 'pvorg.yml'))
    expect(again.decisionCount).toBe(0)
    expect(again.tagsToAdd).toEqual([])
    await libraryState.importApply(path.join(lib.root, 'pvorg.yml'))
    expect(lib.text()).toBe(after)
  })

  it('reports unreadable files', async () => {
    const lib = library()
    const libraryState = await lib.open()
    await expect(libraryState.importPreview(path.join(lib.root, 'missing.yml'))).rejects.toThrow(
      /“missing.yml” couldn’t be read/
    )
    writeFileSync(path.join(lib.root, 'bad.yml'), 'tags: [a')
    await expect(libraryState.importPreview(path.join(lib.root, 'bad.yml'))).rejects.toThrow(
      /isn’t valid YAML/
    )
  })
})
