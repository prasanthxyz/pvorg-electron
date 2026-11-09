import { createStore } from './store'

/** Library search and selection; the selection only ever contains shown videos (SPEC §3.8). */
export const librarySearch = createStore('')
export const librarySelection = createStore<ReadonlySet<string>>(new Set())

export function toggleSelection(filename: string): void {
  librarySelection.set((selected) => {
    const next = new Set(selected)
    if (next.has(filename)) next.delete(filename)
    else next.add(filename)
    return next
  })
}

export function keepOnly(visible: Set<string>): void {
  librarySelection.set((selected) => {
    const kept = [...selected].filter((f) => visible.has(f))
    return kept.length === selected.size ? selected : new Set(kept)
  })
}

/* ---- Sort (optional capability "Video details", SPEC §6.8) ---- */

export type SortKey = 'title' | 'quality' | 'duration' | 'resolution' | 'size'
export interface Sort {
  key: SortKey
  ascending: boolean
}

export const SORT_LABELS: Record<SortKey, string> = {
  title: 'Title',
  quality: 'Quality',
  duration: 'Duration',
  resolution: 'Resolution',
  size: 'Size'
}

export const librarySort = createStore<Sort>({ key: 'title', ascending: true })

interface Sortable {
  details: {
    duration: number
    width: number
    height: number
    fileSize: number
    quality: number | null
  } | null
}

function sortValue(video: Sortable, key: SortKey): number | null {
  const d = video.details
  if (!d) return null
  switch (key) {
    case 'quality':
      return d.quality
    case 'duration':
      return d.duration || null
    case 'resolution':
      return d.width * d.height || null
    case 'size':
      return d.fileSize || null
    default:
      return 0
  }
}

/**
 * Videos arrive sorted by title. Other keys sort by value, ties keep title order, and
 * videos without metadata sort last in either direction.
 */
export function sortVideos<T extends Sortable>(videos: T[], sort: Sort): T[] {
  if (sort.key === 'title') return sort.ascending ? videos : [...videos].reverse()
  const indexed = videos.map((video, index) => ({
    video,
    index,
    value: sortValue(video, sort.key)
  }))
  indexed.sort((a, b) => {
    if (a.value === null || b.value === null) {
      if (a.value === b.value) return a.index - b.index
      return a.value === null ? 1 : -1
    }
    const order = sort.ascending ? a.value - b.value : b.value - a.value
    return order || a.index - b.index
  })
  return indexed.map((i) => i.video)
}

/** Contact sheets being regenerated, shown with a progress indicator on the card. */
export const regenerating = createStore<ReadonlySet<string>>(new Set())
