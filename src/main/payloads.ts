/** Builds the renderer's view of the library (pages, states, media URLs). */

import * as path from 'path'
import { compareLabels, humanize } from './library/display'
import type { Library } from './library/library'
import type { ImportPlan } from './library/importer'
import { triState, type Kind } from './library/relations'
import type { Video } from './library/scanner'
import { MEDIA_SCHEME } from './protocols'
import type {
  FilterItem,
  FiltersState,
  ImportPreview,
  LibraryState,
  MappingState,
  ViewerState,
  VideoSummary
} from '../shared/types'

const UP_NEXT = 10
const CODES = { yes: 'y', no: 'n', undecided: 'u' } as const

const enc = encodeURIComponent

export function sheetUrl(library: Library, filename: string, size: number | null): string | null {
  const version = library.sheetVersion(filename)
  if (version === null) return null
  return `${MEDIA_SCHEME}://sheet/${enc(filename)}?v=${version}${size ? `&size=${size}` : ''}`
}

export function galleryImageUrl(gallery: string, image: string, size: number | null): string {
  return `${MEDIA_SCHEME}://gallery/${enc(gallery)}/${enc(path.basename(image))}${size ? `?size=${size}` : ''}`
}

export function videoUrl(filename: string): string {
  return `${MEDIA_SCHEME}://video/${enc(filename)}`
}

export function videoSummary(
  library: Library,
  video: Video,
  { card = 720, preview = 1920 }: { card?: number; preview?: number } = {}
): VideoSummary {
  return {
    filename: video.filename,
    title: video.displayTitle,
    credits: video.credits,
    studio: video.studio,
    actors: video.cast,
    thumbUrl: sheetUrl(library, video.filename, card),
    previewUrl: sheetUrl(library, video.filename, preview),
    details: library.details(video.filename),
    regenerating: library.isRegenerating(video.filename)
  }
}

export function viewerState(library: Library): ViewerState {
  const config = library.config!
  const total = library.combinations.length
  const current = library.current()
  const state: ViewerState = {
    position: library.position,
    total,
    revision: library.revision,
    current: null,
    nextSheetUrl: null,
    empty: null
  }
  if (!current) {
    state.empty = {
      reason: !library.videos.length
        ? 'noVideos'
        : !library.galleries.length
          ? 'noGalleries'
          : !library.filtersAreDefault()
            ? 'filters'
            : 'mappings',
      videosPath: config.videosPath,
      galleriesPath: config.galleriesPath,
      tagsRequired: library.filters.tags.size > 0
    }
    return state
  }
  const { video, gallery } = current
  state.current = {
    video: {
      filename: video.filename,
      title: video.displayTitle,
      credits: video.credits,
      extension: path.extname(video.filename).slice(1).toLowerCase(),
      sheetUrl: sheetUrl(library, video.filename, null),
      videoUrl: videoUrl(video.filename)
    },
    gallery: {
      name: gallery.name,
      images: gallery.images.map((image) => galleryImageUrl(gallery.name, image, 1920))
    }
  }
  if (total > 1) {
    const upcoming = library.combinations[(library.position + 1) % total]
    state.nextSheetUrl = sheetUrl(library, upcoming.video.filename, null)
  }
  return state
}

function labelSorted(values: string[], humanized: boolean): FilterItem[] {
  return values
    .map((value) => ({ value, label: humanized ? humanize(value) : value }))
    .sort((a, b) => compareLabels(a.label, b.label) || compareLabels(a.value, b.value))
}

export function filtersState(library: Library): FiltersState {
  const f = library.filters
  const total = library.combinations.length
  const upNext: FiltersState['upNext'] = []
  for (let offset = 0; offset < Math.min(UP_NEXT, total); offset++) {
    const index = (library.position + offset) % total
    const c = library.combinations[index]
    upNext.push({
      index,
      title: c.video.displayTitle,
      gallery: c.gallery.name,
      thumbUrl: sheetUrl(library, c.video.filename, 320)
    })
  }
  const sorted = (set: Set<string>): string[] => [...set].sort()
  return {
    sections: {
      galleries: {
        items: labelSorted(library.galleryNames(), false),
        selected: sorted(f.galleries)
      },
      studios: { items: labelSorted(library.allStudios(), true), selected: sorted(f.studios) },
      tags: { items: labelSorted(library.allTags(), false), selected: sorted(f.tags) },
      cast: { items: labelSorted(library.allCast(), true), selected: sorted(f.cast) }
    },
    isDefault: library.filtersAreDefault(),
    count: total,
    videoCount: new Set(library.combinations.map((c) => c.video.filename)).size,
    galleryCount: new Set(library.combinations.map((c) => c.gallery.name)).size,
    upNext,
    revision: library.revision
  }
}

export function libraryState(library: Library): LibraryState {
  return {
    videos: library.videos.map((v) => videoSummary(library, v)),
    skipped: library.skipped.map((s) => ({ filename: s.filename, reasons: [...s.reasons] })),
    videosPath: library.config!.videosPath,
    missingTools: library.status.missingTools,
    revision: library.revision
  }
}

export function mappingState(library: Library, kind: Kind, configPath: string): MappingState {
  const config = library.config!
  const columns = library.columns(kind)
  return {
    kind,
    columns,
    rows: library.videos.map((video) => {
      const relation = config.videoRelations[video.filename]
      const states = columns.map((c) => CODES[triState(relation, kind, c)]).join('')
      return { ...videoSummary(library, video, { card: 320 }), states }
    }),
    galleriesPath: config.galleriesPath,
    configPath,
    revision: library.revision
  }
}

export function importPreview(file: string, plan: ImportPlan): ImportPreview {
  return {
    file,
    matchedVideos: plan.matchedVideos,
    unmatchedVideos: plan.unmatchedVideos,
    matchedGalleries: plan.matchedGalleries,
    unmatchedGalleries: plan.unmatchedGalleries,
    tagsToAdd: plan.tagsToAdd,
    decisionCount: plan.decisionCount,
    keptCount: plan.keptCount
  }
}
