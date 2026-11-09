/** `cache.json`: per-video metadata shared with the other apps (SPEC §1.5). */

import { promises as fs } from 'fs'
import { atomicWriteFile, serializeJson } from './config'

export interface VideoMetadata {
  /** Seconds. */
  duration: number
  width: number
  height: number
  fps: number
  /** Bytes. */
  file_size: number
}

function isMetadata(value: unknown): value is VideoMetadata {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return ['duration', 'width', 'height', 'fps', 'file_size'].every(
    (key) => typeof v[key] === 'number' && Number.isFinite(v[key])
  )
}

export class MetadataCache {
  private constructor(
    readonly file: string,
    private data: Record<string, unknown>
  ) {}

  /** Loads the cache, starting fresh if it's missing or unreadable. */
  static async load(file: string): Promise<MetadataCache> {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'))
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return new MetadataCache(file, parsed)
      }
    } catch {
      /* missing or invalid: start fresh */
    }
    return new MetadataCache(file, {})
  }

  /** Valid metadata for a video, or null. Entries in other shapes are kept but ignored. */
  get(filename: string): VideoMetadata | null {
    const value = this.data[filename]
    return isMetadata(value) ? value : null
  }

  has(filename: string): boolean {
    return filename in this.data
  }

  set(filename: string, value: VideoMetadata): void {
    this.data[filename] = value
  }

  remove(filename: string): boolean {
    if (!(filename in this.data)) return false
    delete this.data[filename]
    return true
  }

  async save(): Promise<void> {
    await atomicWriteFile(this.file, serializeJson(this.data))
  }
}

export interface VideoDetails {
  duration: number
  width: number
  height: number
  fps: number
  fileSize: number
  /** Normalized bitrate in Mbps (§2), or null without enough metadata. */
  quality: number | null
}

/** Average bitrate normalized to 640 × 480 at 30 fps, in Mbps (§2). */
export function qualityScore(meta: VideoMetadata): number | null {
  const { duration, width, height, fps, file_size } = meta
  if (!(duration > 0 && width > 0 && height > 0 && fps > 0 && file_size > 0)) return null
  const bitrate = (file_size * 8) / duration
  return bitrate / ((width * height) / 307200) / (fps / 30) / 1_000_000
}

export function videoDetails(meta: VideoMetadata | null): VideoDetails | null {
  if (!meta) return null
  return {
    duration: meta.duration,
    width: meta.width,
    height: meta.height,
    fps: meta.fps,
    fileSize: meta.file_size,
    quality: qualityScore(meta)
  }
}
