import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
import type { StartupStatus } from '../src/main/library/library'
import { hasFfmpeg, makeVideo, TestLibrary } from './helpers'

const VIDEOS = [
  'acme-jane_doe-harbor_lights.mp4',
  'acme-jane_doe-john_roe-mountain_pass.mp4',
  'globex-sam_lee-desert_road.mp4'
]

function populated(relations: Record<string, unknown> = {}): TestLibrary {
  const lib = new TestLibrary()
  for (const name of VIDEOS) lib.addVideo(name, { sheet: true })
  lib.addGallery('Beach Days').addGallery('City Lights').addGallery('Portraits')
  return lib.writeConfig({ videoRelations: relations })
}

const pairs = (library: Awaited<ReturnType<TestLibrary['open']>>): string[] =>
  library.combinations.map((c) => `${c.video.filename}|${c.gallery.name}`)

describe('startup (§3.2)', () => {
  it('runs the named steps in order and becomes ready', async () => {
    const steps: string[] = []
    const lib = populated()
    const library = await lib.open({
      onStatus: (s: StartupStatus) => {
        if (steps.at(-1) !== s.step) steps.push(s.step)
      },
      preprocess: true
    })
    expect(steps).toEqual([
      'Loading Configuration',
      'Scanning Library',
      'Updating pvorg.json',
      'Cleaning Up Previews',
      'Preparing Previews',
      'Ready'
    ])
    expect(library.status.missingTools).toEqual(['ffmpeg', 'ffprobe'])
    expect(library.videos).toHaveLength(3)
    expect(library.combinations).toHaveLength(9)
  })

  it('allows one run at a time', async () => {
    const library = await populated().open()
    const first = library.load()
    const second = library.load()
    expect(first.started).toBe(true)
    expect(second.started).toBe(false)
    await first.done
  })

  it('shows an error for an invalid config, then recovers on Try Again', async () => {
    const lib = populated()
    lib.writeRaw('{')
    const library = await lib.open()
    expect(library.status.phase).toBe('error')
    expect(library.status.error).toMatch(/isn’t valid JSON/)
    lib.writeConfig()
    await library.load().done
    expect(library.status.phase).toBe('ready')
  })

  it('resets filters on reload', async () => {
    const library = await populated().open()
    await library.setFilters({ galleries: ['Portraits'] })
    expect(library.combinations).toHaveLength(3)
    await library.load().done
    expect(library.combinations).toHaveLength(9)
  })
})

describe('orphaned assets (§3.4)', () => {
  it('deletes contact sheets without a valid video, and nothing else', async () => {
    const lib = populated()
    lib.addSheet('gone-video-file.mp4').addSheet('Bad Name.mp4')
    lib.addVideo('Bad Name.mp4')
    const sprite = path.join(lib.videos, 'sprite')
    mkdirSync(sprite)
    writeFileSync(path.join(sprite, 'gone-video-file.mp4_sprite.jpg'), '')
    writeFileSync(path.join(lib.videos, 'img', 'notes.txt'), '')
    await lib.open()
    const img = path.join(lib.videos, 'img')
    expect(existsSync(path.join(img, 'gone-video-file.mp4.jpg'))).toBe(false)
    expect(existsSync(path.join(img, 'Bad Name.mp4.jpg'))).toBe(false)
    expect(existsSync(path.join(img, `${VIDEOS[0]}.jpg`))).toBe(true)
    expect(existsSync(path.join(img, 'notes.txt'))).toBe(true)
    expect(existsSync(path.join(sprite, 'gone-video-file.mp4_sprite.jpg'))).toBe(true)
  })
})

describe('mapping saves (§3.3)', () => {
  it('saves, rescans and regenerates', async () => {
    const lib = populated()
    const library = await lib.open()
    const saved = await library.saveMappings('galleries', {
      [VIDEOS[0]]: { Portraits: 'no', Nowhere: 'yes' },
      'unknown-video-file.mp4': { Portraits: 'no' }
    })
    expect(saved).toBe(1)
    expect(lib.read().videoRelations).toEqual({
      [VIDEOS[0]]: { galleries: [], excludedGalleries: ['Portraits'], tags: [], excludedTags: [] }
    })
    expect(library.combinations).toHaveLength(8)
  })
})

describe('Exclude Pairing (§3.6)', () => {
  it('removes only that pairing in place and keeps the position', async () => {
    const lib = populated()
    const library = await lib.open()
    await library.goto(4)
    const before = pairs(library)
    const current = library.current()!
    await library.excludePairing(current.video.filename, current.gallery.name)
    const after = pairs(library)
    expect(after).toEqual(before.filter((_, i) => i !== 4))
    expect(library.position).toBe(4)
    expect(lib.read().videoRelations).toEqual({
      [current.video.filename]: {
        galleries: [],
        excludedGalleries: [current.gallery.name],
        tags: [],
        excludedTags: []
      }
    })
  })

  it('wraps to the first combination at the end of the list', async () => {
    const library = await populated().open()
    await library.goto(8)
    const c = library.current()!
    await library.excludePairing(c.video.filename, c.gallery.name)
    expect(library.position).toBe(0)
  })

  it('undo restores pvorg.json exactly and puts the pairing back at its position', async () => {
    const lib = populated({
      [VIDEOS[1]]: {
        galleries: ['City Lights'],
        excludedGalleries: [],
        tags: ['night'],
        excludedTags: []
      }
    })
    const library = await lib.open()
    const original = lib.read()
    const before = pairs(library)

    for (const [filename, gallery] of [
      [VIDEOS[0], 'Beach Days'], // no entry yet: undo removes the entry again
      [VIDEOS[1], 'City Lights'] // previously Yes: undo restores Yes
    ]) {
      const index = before.indexOf(`${filename}|${gallery}`)
      await library.goto(index)
      const exclusion = await library.excludePairing(filename, gallery)
      expect(lib.read()).not.toEqual(original)
      await library.restorePairing(exclusion.id)
      expect(lib.read()).toEqual(original)
      expect(pairs(library)).toEqual(before)
      expect(library.position).toBe(index)
    }
  })

  it('undo keeps the entry when something else was decided since', async () => {
    const lib = populated()
    const library = await lib.open()
    const exclusion = await library.excludePairing(VIDEOS[0], 'Portraits')
    await library.saveMappings('tags', { [VIDEOS[0]]: { night: 'yes' } })
    await library.restorePairing(exclusion.id)
    expect(lib.read().videoRelations).toEqual({
      [VIDEOS[0]]: { galleries: [], excludedGalleries: [], tags: ['night'], excludedTags: [] }
    })
  })

  it('undo doesn’t show a pairing the filters now hide', async () => {
    const library = await populated().open()
    const exclusion = await library.excludePairing(VIDEOS[0], 'Portraits')
    await library.setFilters({ galleries: ['Beach Days'] })
    await library.restorePairing(exclusion.id)
    expect(pairs(library).some((p) => p.endsWith('|Portraits'))).toBe(false)
  })

  it('can’t undo twice', async () => {
    const library = await populated().open()
    const exclusion = await library.excludePairing(VIDEOS[0], 'Portraits')
    await library.restorePairing(exclusion.id)
    await expect(library.restorePairing(exclusion.id)).rejects.toThrow(/can no longer be undone/)
  })
})

describe('deleting videos (§3.7)', () => {
  it('removes the file, contact sheet, relation and cache entry, then resets filters', async () => {
    const lib = populated({ [VIDEOS[0]]: { galleries: ['Portraits'] } })
    const cachePath = path.join(lib.videos, 'cache.json')
    const meta = { duration: 10, width: 640, height: 360, fps: 24, file_size: 1000 }
    writeFileSync(cachePath, JSON.stringify({ [VIDEOS[0]]: meta, [VIDEOS[1]]: meta }))
    const library = await lib.open()
    await library.setFilters({ galleries: ['Portraits'] })
    const result = await library.deleteVideos([VIDEOS[0], 'not-in-library-file.mp4'])
    expect(result.deleted).toBe(1)
    expect(result.errors).toEqual(['Rejected unknown filename: not-in-library-file.mp4'])
    expect(existsSync(path.join(lib.videos, VIDEOS[0]))).toBe(false)
    expect(existsSync(path.join(lib.videos, 'img', `${VIDEOS[0]}.jpg`))).toBe(false)
    expect(lib.read().videoRelations).toEqual({})
    expect(Object.keys(JSON.parse(readFileSync(cachePath, 'utf8')))).toEqual([VIDEOS[1]])
    expect(library.videos).toHaveLength(2)
    expect(library.filtersAreDefault()).toBe(true)
  })

  it('keeps the relation and cache entry when the file can’t be deleted', async () => {
    if (process.platform === 'win32' || process.getuid?.() === 0) return
    const lib = populated({ [VIDEOS[0]]: { galleries: ['Portraits'] } })
    const cachePath = path.join(lib.videos, 'cache.json')
    const meta = { duration: 10, width: 640, height: 360, fps: 24, file_size: 1000 }
    writeFileSync(cachePath, JSON.stringify({ [VIDEOS[0]]: meta }))
    const library = await lib.open()
    chmodSync(lib.videos, 0o555)
    try {
      const result = await library.deleteVideos([VIDEOS[0]])
      expect(result.deleted).toBe(0)
      expect(result.errors[0]).toMatch(/Couldn’t delete “acme-jane_doe-harbor_lights.mp4”/)
    } finally {
      chmodSync(lib.videos, 0o755)
    }
    expect(existsSync(path.join(lib.videos, VIDEOS[0]))).toBe(true)
    expect(Object.keys(lib.read().videoRelations as object)).toEqual([VIDEOS[0]])
    expect(Object.keys(JSON.parse(readFileSync(cachePath, 'utf8')))).toEqual([VIDEOS[0]])
  })

  it('treats a missing contact sheet as fine', async () => {
    const lib = populated()
    const library = await lib.open()
    await library.deleteVideos([VIDEOS[2]])
    lib.addVideo('initech-a-b.mp4')
    await library.rescan(true)
    const result = await library.deleteVideos(['initech-a-b.mp4'])
    expect(result).toEqual({ deleted: 1, errors: [] })
  })
})

describe('stale entries (§3.5)', () => {
  it('previews and removes only entries whose video is gone', async () => {
    const lib = populated({ [VIDEOS[0]]: {}, 'gone-a-b.mp4': {}, 'gone-c-d.mp4': {} })
    const library = await lib.open()
    const preview = await library.stalePreview()
    expect(preview).toEqual({
      videosPath: lib.videos,
      videoFileCount: 3,
      relationCount: 3,
      staleEntries: ['gone-a-b.mp4', 'gone-c-d.mp4'],
      highRisk: false
    })
    lib.addVideo('gone-c-d.mp4')
    expect(await library.removeStale([...preview.staleEntries, VIDEOS[0]])).toBe(1)
    expect(Object.keys(lib.read().videoRelations as object).sort()).toEqual([
      VIDEOS[0],
      'gone-c-d.mp4'
    ])
  })

  it('flags high risk when no videos are visible but entries exist', async () => {
    const lib = new TestLibrary()
      .addGallery('G')
      .writeConfig({ videoRelations: { 'a-b-c.mp4': {} } })
    const library = await lib.open()
    expect((await library.stalePreview()).highRisk).toBe(true)
  })
})

describe('tag vocabulary (§3.9)', () => {
  it('adds comma-separated names, skipping existing ones ignoring case', async () => {
    const lib = populated()
    const library = await lib.open()
    expect(await library.addTags(' travel , NIGHT,, 4K , drone, travel')).toEqual({
      added: ['travel', 'drone'],
      skipped: ['NIGHT', '4K', 'travel']
    })
    expect(lib.read().tags).toEqual(['4k', 'night', 'outdoor', 'travel', 'drone'])
  })

  it('removes a tag everywhere, including the required tags', async () => {
    const lib = populated({
      [VIDEOS[0]]: { tags: ['night', 'outdoor'], excludedTags: [] },
      [VIDEOS[1]]: { tags: [], excludedTags: ['night'] },
      [VIDEOS[2]]: { tags: ['outdoor'] }
    })
    const library = await lib.open()
    await library.setFilters({ tags: ['night'] })
    expect(library.tagDecisionCount('night')).toBe(2)
    expect(await library.removeTag('night')).toBe(2)
    const data = lib.read() as {
      tags: string[]
      videoRelations: Record<string, { tags: string[]; excludedTags: string[] }>
    }
    expect(data.tags).toEqual(['4k', 'outdoor'])
    expect(data.videoRelations[VIDEOS[0]].tags).toEqual(['outdoor'])
    expect(data.videoRelations[VIDEOS[1]].excludedTags).toEqual([])
    expect(library.filters.tags.size).toBe(0)
  })
})

describe.runIf(hasFfmpeg())('preview generation with ffmpeg (§1.5, §3.2 step 5)', () => {
  it('generates missing contact sheets and metadata, and regenerates on request', async () => {
    const lib = new TestLibrary().addGallery('G')
    makeVideo(path.join(lib.videos, 'acme-a-clip.mp4'), 3)
    makeVideo(path.join(lib.videos, 'acme-a-other.mkv'), 3)
    lib.writeConfig()
    const { findTools } = await import('../src/main/library/preview')
    const details: string[] = []
    const library = await lib.open({
      preprocess: true,
      findTools,
      onStatus: (s: StartupStatus) => {
        if (s.step === 'Preparing Previews' && s.detail) details.push(s.detail)
      }
    })
    expect(details).toEqual(['1 of 2 · acme-a-clip.mp4', '2 of 2 · acme-a-other.mkv'])
    for (const name of ['acme-a-clip.mp4', 'acme-a-other.mkv']) {
      expect(library.hasSheet(name)).toBe(true)
      const sheet = readFileSync(path.join(lib.videos, 'img', `${name}.jpg`))
      // JPEG SOF0 width: 4×4 grid scaled to 1920 px.
      expect(jpegWidth(sheet)).toBe(1920)
      expect(library.details(name)).toMatchObject({ width: 320, height: 180, fps: 24 })
      expect(library.details(name)!.duration).toBeGreaterThan(2.5)
    }
    const version = library.sheetVersion('acme-a-clip.mp4')
    await new Promise((r) => setTimeout(r, 20))
    expect(await library.regenerateSheet('acme-a-clip.mp4')).toBe(true)
    expect(library.sheetVersion('acme-a-clip.mp4')).not.toBe(version)
  }, 60_000)
})

function jpegWidth(data: Buffer): number {
  let i = 2
  while (i < data.length) {
    const marker = data[i + 1]
    const length = data.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xc3) return data.readUInt16BE(i + 7)
    i += 2 + length
  }
  return -1
}
