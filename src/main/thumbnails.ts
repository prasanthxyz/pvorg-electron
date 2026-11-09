/**
 * Downsized images at the spec's decode sizes (SPEC §8.2), cached on disk in the app's
 * data folder, never in the library. Grids would otherwise decode 1920 px contact sheets
 * for 300 px cards.
 */

import { createHash, randomBytes } from 'crypto'
import { nativeImage } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'

export const SIZES = [320, 720, 1920, 4096] as const

/** The smallest standard size covering the request, or null for full resolution. */
export function nearestSize(requested: number): number | null {
  for (const size of SIZES) if (requested <= size) return size
  return null
}

export class ThumbnailCache {
  private inFlight = new Map<string, Promise<string>>()

  constructor(private readonly dir: string) {}

  /** A JPEG whose longest edge is at most the standard size, or the source itself. */
  async get(source: string, requested: number | null): Promise<string> {
    const size = requested ? nearestSize(requested) : null
    if (!size) return source
    const stat = await fs.stat(source)
    const key = createHash('sha1')
      .update(`${source}|${stat.mtimeMs}|${stat.size}|${size}`)
      .digest('hex')
    const target = path.join(this.dir, key.slice(0, 2), `${key}.jpg`)
    const existing = this.inFlight.get(target)
    if (existing) return existing
    const task = this.make(source, target, size).finally(() => this.inFlight.delete(target))
    this.inFlight.set(target, task)
    return task
  }

  private async make(source: string, target: string, size: number): Promise<string> {
    if (
      await fs
        .stat(target)
        .then((s) => s.isFile())
        .catch(() => false)
    )
      return target
    const image = nativeImage.createFromPath(source)
    if (image.isEmpty()) return source // a format nativeImage can't decode: serve as-is
    const { width, height } = image.getSize()
    const isJpeg = /\.jpe?g$/i.test(source)
    if (Math.max(width, height) <= size && isJpeg) return source
    const scaled =
      Math.max(width, height) <= size
        ? image
        : image.resize(
            width >= height ? { width: size, quality: 'good' } : { height: size, quality: 'good' }
          )
    await fs.mkdir(path.dirname(target), { recursive: true })
    // A unique partial name, so concurrent writers never share a file; the rename is atomic.
    const partial = `${target}.${randomBytes(6).toString('hex')}.partial`
    try {
      await fs.writeFile(partial, scaled.toJPEG(85))
      await fs.rename(partial, target)
    } catch (error) {
      await fs.rm(partial, { force: true })
      throw error
    }
    return target
  }
}
