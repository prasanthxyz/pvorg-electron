/** Combinations and the filter rules (SPEC §3.1). */

import type { Gallery, Video } from './scanner'

export interface Combination {
  video: Video
  gallery: Gallery
}

export interface Filters {
  galleries: Set<string>
  studios: Set<string>
  tags: Set<string>
  cast: Set<string>
}

export type Random = () => number

function hasAll(required: Set<string>, values: string[]): boolean {
  if (required.size === 0) return true
  const present = new Set(values)
  for (const value of required) if (!present.has(value)) return false
  return true
}

/** Studio included, every required tag marked Yes, every required cast member present. */
export function videoPasses(video: Video, filters: Filters): boolean {
  return (
    filters.studios.has(video.studio) &&
    hasAll(filters.cast, video.cast) &&
    hasAll(filters.tags, video.tags)
  )
}

/** Gallery included, and the video isn't excluded from it. */
export function galleryPasses(gallery: Gallery, video: Video, filters: Filters): boolean {
  return filters.galleries.has(gallery.name) && video.relatedGalleries.includes(gallery.name)
}

export function shuffle<T>(items: T[], random: Random = Math.random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

export function generateCombinations(
  videos: Video[],
  galleries: Gallery[],
  filters: Filters,
  random: Random = Math.random
): Combination[] {
  const combinations: Combination[] = []
  for (const video of videos) {
    if (!videoPasses(video, filters)) continue
    for (const gallery of galleries) {
      if (galleryPasses(gallery, video, filters)) combinations.push({ video, gallery })
    }
  }
  return shuffle(combinations, random)
}
