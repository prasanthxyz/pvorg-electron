/**
 * One-time import of the old Electron library, `pvorg.yml` (SPEC §3.10).
 *
 * The old file listed video file paths, gallery folder paths and tag names, plus
 * explicit [video, gallery] and [video, tag] pairs. Every new video was paired with
 * every gallery, so a missing pair meant the pairing had been removed.
 */

import { parse } from 'yaml'
import type { AppConfig } from './config'
import { compareCodePoints, compareTitles } from './display'
import { applyMappingChanges, type Changes, triState } from './relations'
import type { SkippedFile, Video } from './scanner'

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

export interface OldLibrary {
  videos: string[]
  galleries: string[]
  tags: string[]
  videoGalleries: [string, string][]
  videoTags: [string, string][]
}

/** The last path component, for POSIX and Windows paths alike. */
export function baseName(file: string): string {
  const trimmed = file.replace(/[\\/]+$/, '')
  const parts = trimmed.split(/[\\/]/)
  return parts[parts.length - 1] ?? ''
}

function strings(value: unknown, key: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new ImportError(`“${key}” must be a list.`)
  return value.map((item) => {
    if (typeof item === 'string') return item
    // Old video entries were objects with a filePath and probed metadata.
    if (key === 'videos' && item && typeof item === 'object' && 'filePath' in item) {
      const filePath = (item as { filePath: unknown }).filePath
      if (typeof filePath === 'string') return filePath
    }
    throw new ImportError(`“${key}” contains an entry pvorg can’t read.`)
  })
}

function pairs(value: unknown, key: string): [string, string][] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new ImportError(`“${key}” must be a list.`)
  return value.map((item) => {
    if (
      Array.isArray(item) &&
      item.length === 2 &&
      typeof item[0] === 'string' &&
      typeof item[1] === 'string'
    ) {
      return [item[0], item[1]]
    }
    throw new ImportError(
      `“${key}” must contain [video, ${key === 'videoTags' ? 'tag' : 'gallery'}] pairs.`
    )
  })
}

export function parseOldLibrary(text: string, name = 'pvorg.yml'): OldLibrary {
  let data: unknown
  try {
    data = parse(text)
  } catch (error) {
    throw new ImportError(`${name} isn’t valid YAML: ${(error as Error).message.split('\n')[0]}`)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ImportError(`${name} doesn’t look like a pvorg library.`)
  }
  const d = data as Record<string, unknown>
  if (!['videos', 'galleries', 'videoGalleries', 'videoTags'].some((key) => key in d)) {
    throw new ImportError(`${name} doesn’t look like a pvorg library.`)
  }
  return {
    videos: strings(d.videos, 'videos'),
    galleries: strings(d.galleries, 'galleries'),
    tags: strings(d.tags, 'tags'),
    videoGalleries: pairs(d.videoGalleries, 'videoGalleries'),
    videoTags: pairs(d.videoTags, 'videoTags')
  }
}

export interface ImportedVideo {
  filename: string
  title: string
  galleriesYes: number
  galleriesNo: number
  tags: string[]
}

export interface UnmatchedVideo {
  path: string
  reason: string
}

export interface ImportPlan {
  matchedVideos: ImportedVideo[]
  unmatchedVideos: UnmatchedVideo[]
  matchedGalleries: string[]
  unmatchedGalleries: string[]
  tagsToAdd: string[]
  /** Cells that will change from Undecided. */
  decisionCount: number
  /** Cells the file would have set but that already have a decision (existing decisions win). */
  keptCount: number
  galleryChanges: Changes
  tagChanges: Changes
}

export interface LibraryView {
  config: AppConfig
  videos: Video[]
  skipped: SkippedFile[]
  /** Gallery names in vocabulary order. */
  galleryNames: string[]
}

/** What importing `old` into the library would do. Nothing is written. */
export function planImport(old: OldLibrary, library: LibraryView): ImportPlan {
  const { config, videos, skipped, galleryNames } = library
  const byFilename = new Map(videos.map((v) => [v.filename, v]))
  const skippedNames = new Set(skipped.map((s) => s.filename))

  // Videos: listed ones plus any that only appear in pairs, merged by filename.
  const videoPaths = [
    ...old.videos,
    ...old.videoGalleries.map(([v]) => v),
    ...old.videoTags.map(([v]) => v)
  ]
  const pathsByFilename = new Map<string, string>()
  const unmatched = new Map<string, UnmatchedVideo>()
  for (const file of videoPaths) {
    const name = baseName(file)
    if (byFilename.has(name)) {
      if (!pathsByFilename.has(name)) pathsByFilename.set(name, file)
    } else if (!unmatched.has(file)) {
      unmatched.set(file, {
        path: file,
        reason: skippedNames.has(name)
          ? 'In the videos folder, but its name doesn’t follow studio-cast-title'
          : 'Not in the videos folder'
      })
    }
  }

  // Galleries: matched by folder name.
  const known = new Set(galleryNames)
  const oldGalleries = [...old.galleries, ...old.videoGalleries.map(([, g]) => g)]
  const matchedGalleries = new Set<string>()
  const unmatchedGalleries = new Set<string>()
  for (const folder of oldGalleries) {
    const name = baseName(folder)
    if (known.has(name)) matchedGalleries.add(name)
    else unmatchedGalleries.add(folder)
  }

  // Tags: names matching the vocabulary ignoring case use the existing name.
  const vocabulary = new Map(config.tags.map((t) => [t.toLowerCase(), t]))
  const tagsToAdd: string[] = []
  const tagName = (raw: string): string | null => {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const key = trimmed.toLowerCase()
    const existing = vocabulary.get(key)
    if (existing) return existing
    vocabulary.set(key, trimmed)
    tagsToAdd.push(trimmed)
    return trimmed
  }
  for (const tag of old.tags) tagName(tag)

  const yesGalleries = new Map<string, Set<string>>()
  for (const [video, gallery] of old.videoGalleries) {
    const name = baseName(video)
    if (!pathsByFilename.has(name)) continue
    const set = yesGalleries.get(name) ?? new Set<string>()
    set.add(baseName(gallery))
    yesGalleries.set(name, set)
  }
  const yesTags = new Map<string, Set<string>>()
  for (const [video, tag] of old.videoTags) {
    const name = baseName(video)
    if (!pathsByFilename.has(name)) continue
    const resolved = tagName(tag)
    if (!resolved) continue
    const set = yesTags.get(name) ?? new Set<string>()
    set.add(resolved)
    yesTags.set(name, set)
  }

  const galleryChanges: Changes = {}
  const tagChanges: Changes = {}
  let decisionCount = 0
  let keptCount = 0
  const matchedVideos: ImportedVideo[] = []
  const galleryOrder = galleryNames.filter((g) => matchedGalleries.has(g))

  for (const filename of pathsByFilename.keys()) {
    const relation = config.videoRelations[filename]
    const yes = yesGalleries.get(filename) ?? new Set<string>()
    const cells: Record<string, 'yes' | 'no'> = {}
    let galleriesYes = 0
    let galleriesNo = 0
    for (const gallery of galleryOrder) {
      const wanted = yes.has(gallery) ? 'yes' : 'no'
      if (wanted === 'yes') galleriesYes += 1
      else galleriesNo += 1
      if (triState(relation, 'galleries', gallery) === 'undecided') cells[gallery] = wanted
      else keptCount += 1
    }
    if (Object.keys(cells).length) {
      galleryChanges[filename] = cells
      decisionCount += Object.keys(cells).length
    }

    const tags = [...(yesTags.get(filename) ?? [])].sort(compareCodePoints)
    const tagCells: Record<string, 'yes'> = {}
    for (const tag of tags) {
      if (triState(relation, 'tags', tag) === 'undecided') tagCells[tag] = 'yes'
      else keptCount += 1
    }
    if (Object.keys(tagCells).length) {
      tagChanges[filename] = tagCells
      decisionCount += Object.keys(tagCells).length
    }

    const video = byFilename.get(filename) as Video
    matchedVideos.push({ filename, title: video.displayTitle, galleriesYes, galleriesNo, tags })
  }

  matchedVideos.sort((a, b) =>
    compareTitles(
      { displayTitle: a.title, filename: a.filename },
      { displayTitle: b.title, filename: b.filename }
    )
  )
  return {
    matchedVideos,
    unmatchedVideos: [...unmatched.values()].sort((a, b) => compareCodePoints(a.path, b.path)),
    matchedGalleries: galleryOrder,
    unmatchedGalleries: [...unmatchedGalleries].sort(compareCodePoints),
    tagsToAdd,
    decisionCount,
    keptCount,
    galleryChanges,
    tagChanges
  }
}

/** Applies a plan to `config` in memory. Returns whether anything changed. */
export function applyImport(config: AppConfig, plan: ImportPlan, galleryNames: string[]): boolean {
  if (plan.tagsToAdd.length === 0 && plan.decisionCount === 0) return false
  config.tags.push(...plan.tagsToAdd)
  applyMappingChanges(config, 'galleries', plan.galleryChanges, galleryNames)
  applyMappingChanges(config, 'tags', plan.tagChanges, [...config.tags].sort(compareCodePoints))
  return true
}
