/** Scan the filesystem for videos and galleries (SPEC §1.3, §1.4). */

import { Dirent, promises as fs } from 'fs'
import * as path from 'path'
import type { AppConfig } from './config'
import { compareCodePoints, compareTitles, credits, displayTitle } from './display'

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm'])
export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.gif'])

export interface Video {
  filename: string
  studio: string
  cast: string[]
  title: string
  displayTitle: string
  credits: string
  /** Galleries are opt-out: every gallery the video isn't excluded from. */
  relatedGalleries: string[]
  /** Tags are opt-in: only tags explicitly marked Yes. */
  tags: string[]
}

export interface Gallery {
  name: string
  /** Absolute image paths, sorted by filename. */
  images: string[]
}

export interface SkippedFile {
  filename: string
  reasons: string[]
}

export function isVideoFile(name: string): boolean {
  return !name.startsWith('.') && VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase())
}

function stem(filename: string): string {
  const ext = path.extname(filename)
  return ext ? filename.slice(0, -ext.length) : filename
}

/** Reasons a filename breaks the convention; empty when it is valid. */
export function validateVideoFilename(filename: string): string[] {
  const reasons: string[] = []
  if (filename !== filename.toLowerCase()) reasons.push('Contains uppercase characters')
  if (filename.includes(' ')) reasons.push('Contains spaces')
  if (stem(filename).split('-').length < 3) {
    reasons.push('Fewer than 3 dash-separated parts (need studio-cast-title)')
  }
  return reasons
}

/** `studio-cast1-cast2-…-title.ext` → studio, cast, title. */
export function parseVideoFilename(filename: string): {
  studio: string
  cast: string[]
  title: string
} {
  const parts = stem(filename).split('-')
  if (parts.length < 3) return { studio: parts[0] || 'unknown', cast: [], title: stem(filename) }
  return { studio: parts[0], cast: parts.slice(1, -1), title: parts[parts.length - 1] }
}

async function listDir(dir: string): Promise<Dirent[] | null> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries.sort((a, b) => compareCodePoints(a.name, b.name))
  } catch {
    return null
  }
}

async function isFile(dir: string, entry: Dirent): Promise<boolean> {
  if (entry.isFile()) return true
  if (!entry.isSymbolicLink()) return false
  return fs
    .stat(path.join(dir, entry.name))
    .then((s) => s.isFile())
    .catch(() => false)
}

async function isDirectory(dir: string, entry: Dirent): Promise<boolean> {
  if (entry.isDirectory()) return true
  if (!entry.isSymbolicLink()) return false
  return fs
    .stat(path.join(dir, entry.name))
    .then((s) => s.isDirectory())
    .catch(() => false)
}

export function makeVideo(filename: string, config: AppConfig, galleryNames: string[]): Video {
  const { studio, cast, title } = parseVideoFilename(filename)
  const relation = config.videoRelations[filename]
  const excluded = new Set(relation?.excludedGalleries ?? [])
  return {
    filename,
    studio,
    cast,
    title,
    displayTitle: displayTitle(title, filename),
    credits: credits(studio, cast),
    relatedGalleries: galleryNames.filter((g) => !excluded.has(g)),
    tags: [...(relation?.tags ?? [])]
  }
}

/** Valid videos sorted for display, plus files skipped for their names. */
export async function scanVideos(
  config: AppConfig,
  galleryNames: string[]
): Promise<{ videos: Video[]; skipped: SkippedFile[] }> {
  const entries = await listDir(config.videosPath)
  if (!entries) return { videos: [], skipped: [] }
  const videos: Video[] = []
  const skipped: SkippedFile[] = []
  for (const entry of entries) {
    if (!isVideoFile(entry.name) || !(await isFile(config.videosPath, entry))) continue
    const reasons = validateVideoFilename(entry.name)
    if (reasons.length) {
      skipped.push({ filename: entry.name, reasons })
      continue
    }
    videos.push(makeVideo(entry.name, config, galleryNames))
  }
  videos.sort(compareTitles)
  return { videos, skipped }
}

export async function scanGalleries(galleriesPath: string): Promise<Gallery[]> {
  const entries = await listDir(galleriesPath)
  if (!entries) return []
  const galleries: Gallery[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || !(await isDirectory(galleriesPath, entry))) continue
    const folder = path.join(galleriesPath, entry.name)
    const images: string[] = []
    for (const image of (await listDir(folder)) ?? []) {
      if (image.name.startsWith('.')) continue
      if (!IMAGE_EXTENSIONS.has(path.extname(image.name).toLowerCase())) continue
      if (await isFile(folder, image)) images.push(path.join(folder, image.name))
    }
    galleries.push({ name: entry.name, images })
  }
  return galleries
}

/** Counts video files on disk (any name), for the stale-entry preview. */
export async function countVideoFiles(videosPath: string): Promise<number> {
  const entries = await listDir(videosPath)
  if (!entries) return 0
  let count = 0
  for (const entry of entries) {
    if (isVideoFile(entry.name) && (await isFile(videosPath, entry))) count += 1
  }
  return count
}
