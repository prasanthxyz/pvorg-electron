/** Contact sheets and metadata with ffmpeg and ffprobe from PATH (SPEC §1.5, §3.2 step 5). */

import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import * as path from 'path'
import type { VideoMetadata } from './cache'

export interface Tools {
  ffmpeg: string | null
  ffprobe: string | null
}

export const SHEET_COLUMNS = 4
export const SHEET_ROWS = 4
export const SHEET_WIDTH = 1920

/**
 * PATH plus the usual package-manager folders: apps started from the Dock, Finder or a
 * desktop launcher get a minimal PATH that misses Homebrew and similar installs.
 */
export function searchPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string[] {
  // QA runs can pin the search to chosen folders, to exercise the missing-tool warning.
  if (env.PVORG_TOOLS_PATH !== undefined) {
    return env.PVORG_TOOLS_PATH.split(path.delimiter).filter(Boolean)
  }
  const dirs = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean)
  const extra =
    platform === 'darwin'
      ? ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin']
      : platform === 'win32'
        ? []
        : ['/usr/local/bin', '/usr/bin', '/snap/bin']
  for (const dir of extra) if (!dirs.includes(dir)) dirs.push(dir)
  return dirs
}

export async function findTool(
  name: string,
  dirs: string[] = searchPath(),
  platform: NodeJS.Platform = process.platform
): Promise<string | null> {
  const names = platform === 'win32' ? [`${name}.exe`, name] : [name]
  for (const dir of dirs) {
    for (const candidate of names) {
      const file = path.join(dir, candidate)
      try {
        const stat = await fs.stat(file)
        if (!stat.isFile()) continue
        if (platform !== 'win32') await fs.access(file, fs.constants.X_OK)
        return file
      } catch {
        /* not here */
      }
    }
  }
  return null
}

export async function findTools(dirs: string[] = searchPath()): Promise<Tools> {
  const [ffmpeg, ffprobe] = await Promise.all([findTool('ffmpeg', dirs), findTool('ffprobe', dirs)])
  return { ffmpeg, ffprobe }
}

export function missingTools(tools: Tools): string[] {
  return (['ffmpeg', 'ffprobe'] as const).filter((name) => !tools[name])
}

function run(file: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout))
    )
  })
}

/** The first finite, positive number in ffprobe's output. */
export function parseDuration(output: string): number | null {
  for (const token of output.split(/\s+/)) {
    const value = Number(token)
    if (token && Number.isFinite(value) && value > 0) return value
  }
  return null
}

/** Stream duration, falling back to the container's (Matroska and WebM have no stream duration). */
export async function probeDuration(ffprobe: string, file: string): Promise<number | null> {
  try {
    const output = await run(
      ffprobe,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=duration:format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        file
      ],
      30_000
    )
    return parseDuration(output)
  } catch {
    return null
  }
}

function parseRate(rate: unknown): number {
  if (typeof rate !== 'string' || !rate) return 0
  const [num, den] = rate.split('/').map(Number)
  if (den === undefined) return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0
  return den ? Math.round((num / den) * 100) / 100 : 0
}

export function parseMetadata(output: string): VideoMetadata | null {
  try {
    const data = JSON.parse(output)
    const stream = data.streams?.[0] ?? {}
    const format = data.format ?? {}
    const duration = parseDuration(`${stream.duration ?? ''} ${format.duration ?? ''}`) ?? 0
    return {
      duration,
      width: Number(stream.width) || 0,
      height: Number(stream.height) || 0,
      fps: parseRate(stream.r_frame_rate),
      file_size: Number(format.size) || 0
    }
  } catch {
    return null
  }
}

export async function probeMetadata(ffprobe: string, file: string): Promise<VideoMetadata | null> {
  try {
    const output = await run(
      ffprobe,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=duration,width,height,r_frame_rate:format=size,duration',
        '-of',
        'json',
        file
      ],
      30_000
    )
    return parseMetadata(output)
  } catch {
    return null
  }
}

/** ffmpeg arguments for a 4×4 grid of frames at evenly spaced times, scaled to 1920 px wide. */
export function contactSheetArgs(file: string, duration: number, output: string): string[] {
  const tiles = SHEET_COLUMNS * SHEET_ROWS
  const interval = duration / tiles
  const inputs: string[] = []
  const labels: string[] = []
  const layout: string[] = []
  for (let i = 0; i < tiles; i++) {
    inputs.push('-ss', (interval / 2 + i * interval).toFixed(2), '-i', file)
    labels.push(`[${i}:v]`)
    const col = i % SHEET_COLUMNS
    const row = Math.floor(i / SHEET_COLUMNS)
    const x = col ? Array(col).fill('w0').join('+') : '0'
    const y = row ? Array(row).fill('h0').join('+') : '0'
    layout.push(`${x}_${y}`)
  }
  const filter =
    `${labels.join('')}xstack=inputs=${tiles}:layout=${layout.join('|')}[v];` +
    `[v]scale=${SHEET_WIDTH}:-2[sheet]`
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    ...inputs,
    '-filter_complex',
    filter,
    '-map',
    '[sheet]',
    '-frames:v',
    '1',
    '-q:v',
    '3',
    '-y',
    output
  ]
}

/**
 * Writes `output` (replacing it when `force`), via a partial file beside it, so an
 * interrupted run never leaves a truncated sheet. Returns whether a sheet now exists.
 */
export async function generateContactSheet(
  tools: Tools,
  file: string,
  output: string,
  force = false
): Promise<boolean> {
  if (!force) {
    const existing = await fs.stat(output).catch(() => null)
    if (existing?.isFile()) return true
  }
  if (!tools.ffmpeg || !tools.ffprobe) return false
  const duration = await probeDuration(tools.ffprobe, file)
  if (duration === null || duration < 1) return false
  await fs.mkdir(path.dirname(output), { recursive: true })
  const partial = path.join(path.dirname(output), `.${path.basename(output, '.jpg')}.partial.jpg`)
  try {
    await run(tools.ffmpeg, contactSheetArgs(file, duration, partial), 180_000)
    await fs.rename(partial, output)
    return true
  } catch {
    await fs.rm(partial, { force: true })
    return false
  }
}
