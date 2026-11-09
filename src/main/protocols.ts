/**
 * Custom protocols (SPEC §16 Security).
 *
 * - `pvorg-app://app/…` serves the built renderer with a strict Content-Security-Policy.
 * - `pvorg-media://<kind>/<name>…` serves contact sheets, gallery images and videos, addressed
 *   by library names, never by path: only files that belong to the scanned library resolve.
 */

import { createReadStream, promises as fs } from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import type { Library } from './library/library'
import { sheetPath } from './library/cleanup'
import type { ThumbnailCache } from './thumbnails'

export const APP_SCHEME = 'pvorg-app'
export const APP_ORIGIN = `${APP_SCHEME}://app`
export const MEDIA_SCHEME = 'pvorg-media'

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  `img-src 'self' ${MEDIA_SCHEME}: data: blob:`,
  `media-src ${MEDIA_SCHEME}:`,
  "font-src 'self'",
  `connect-src 'self' ${MEDIA_SCHEME}:`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'"
].join('; ')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv'
}

function mime(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
}

function notFound(message = 'Not found'): Response {
  return new Response(message, { status: 404, headers: { 'Content-Type': 'text/plain' } })
}

/** True when `file` is inside `root` (after resolving), so `..` can never escape it. */
export function isInside(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(file))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export function rendererHandler(rendererDir: string) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    if (url.host !== 'app') return notFound()
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
    const file = path.join(rendererDir, relative)
    if (!isInside(rendererDir, file)) return notFound()
    try {
      const data = await fs.readFile(file)
      return new Response(new Uint8Array(data), {
        headers: {
          'Content-Type': mime(file),
          'Content-Security-Policy': CSP,
          'X-Content-Type-Options': 'nosniff'
        }
      })
    } catch {
      return notFound()
    }
  }
}

/** Resolves a media URL to a file in the library, or null. */
export function resolveMedia(
  library: Library,
  url: URL
): { file: string; kind: 'sheet' | 'gallery' | 'video' } | null {
  // The loaded library stays servable during a reload, so images already on screen don't fail.
  const config = library.config
  if (!config) return null
  let parts: string[]
  try {
    parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return null
  }
  const kind = url.host
  if (kind === 'sheet' && parts.length === 1) {
    const [filename] = parts
    if (!library.video(filename) || !library.hasSheet(filename)) return null
    const file = sheetPath(config.videosPath, filename)
    return isInside(config.videosPath, file) ? { file, kind } : null
  }
  if (kind === 'video' && parts.length === 1) {
    const [filename] = parts
    if (!library.video(filename)) return null
    const file = path.join(config.videosPath, filename)
    return isInside(config.videosPath, file) ? { file, kind } : null
  }
  if (kind === 'gallery' && parts.length === 2) {
    const [name, image] = parts
    const file = library.gallery(name)?.images.find((i) => path.basename(i) === image)
    if (!file || !isInside(config.galleriesPath, file)) return null
    return { file, kind }
  }
  return null
}

function corsHeaders(request: Request, allowedOrigins: string[]): Record<string, string> {
  const origin = request.headers.get('Origin')
  return origin && allowedOrigins.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {}
}

/** Streams a file, honouring a single byte range so videos can seek. */
async function fileResponse(
  request: Request,
  file: string,
  type: string,
  extra: Record<string, string>
): Promise<Response> {
  const stat = await fs.stat(file)
  const size = stat.size
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') ?? '')
  if (range && (range[1] || range[2])) {
    let start: number
    let end: number
    if (range[1]) {
      start = Number(range[1])
      end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    } else {
      start = Math.max(size - Number(range[2]), 0)
      end = size - 1
    }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }
    const stream = createReadStream(file, { start, end })
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...headers,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`
      }
    })
  }
  const stream = createReadStream(file)
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: { ...headers, 'Content-Length': String(size) }
  })
}

export function mediaHandler(
  library: Library,
  thumbnails: ThumbnailCache,
  allowedOrigins: () => string[]
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return notFound()
    const url = new URL(request.url)
    const resolved = resolveMedia(library, url)
    if (!resolved) return notFound()
    const cors = corsHeaders(request, allowedOrigins())
    try {
      if (resolved.kind === 'video') {
        return await fileResponse(request, resolved.file, mime(resolved.file), cors)
      }
      const size = Number(url.searchParams.get('size')) || null
      const target = await thumbnails.get(resolved.file, size)
      return await fileResponse(request, target, mime(target), {
        ...cors,
        // URLs carry a version token, so images can be cached for good.
        'Cache-Control': 'private, max-age=31536000, immutable'
      })
    } catch {
      return notFound()
    }
  }
}
