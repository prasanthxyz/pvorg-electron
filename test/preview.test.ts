import { mkdirSync, writeFileSync } from 'fs'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
import { qualityScore, videoDetails } from '../src/main/library/cache'
import {
  contactSheetArgs,
  findTool,
  missingTools,
  parseDuration,
  parseMetadata,
  searchPath
} from '../src/main/library/preview'
import { scratch } from './helpers'

describe('contact sheet command (§1.5)', () => {
  it('samples 16 evenly spaced frames into a 4×4 grid 1920 px wide', () => {
    const args = contactSheetArgs('/v/a-b-c.mp4', 160, '/v/img/.a-b-c.mp4.partial.jpg')
    const seeks = args.flatMap((arg, i) => (arg === '-ss' ? [args[i + 1]] : []))
    expect(seeks).toEqual(Array.from({ length: 16 }, (_, i) => (5 + i * 10).toFixed(2)))
    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toContain('xstack=inputs=16:layout=0_0|w0_0|w0+w0_0|w0+w0+w0_0|0_h0|')
    expect(filter).toContain('w0+w0+w0_h0+h0+h0')
    expect(filter).toContain('scale=1920:-2')
    expect(args.at(-1)).toBe('/v/img/.a-b-c.mp4.partial.jpg')
  })
})

describe('ffprobe parsing', () => {
  it('falls back to the container duration (Matroska and WebM)', () => {
    expect(parseDuration('N/A\n12.480000\n')).toBe(12.48)
    expect(parseDuration('6.000000\n6.016000\n')).toBe(6)
    expect(parseDuration('N/A\n')).toBeNull()
  })

  it('reads metadata', () => {
    const output = JSON.stringify({
      streams: [{ width: 1920, height: 1080, r_frame_rate: '30000/1001' }],
      format: { duration: '10.5', size: '13125000' }
    })
    expect(parseMetadata(output)).toEqual({
      duration: 10.5,
      width: 1920,
      height: 1080,
      fps: 29.97,
      file_size: 13125000
    })
    expect(parseMetadata('not json')).toBeNull()
  })
})

describe('quality score (§2)', () => {
  it('normalizes bitrate to 640 × 480 at 30 fps, in Mbps', () => {
    // 10 Mbit/s at 1280×720 (3× the pixels of 640×480) and 60 fps (2×).
    const meta = { duration: 8, width: 1280, height: 720, fps: 60, file_size: 10_000_000 }
    expect(qualityScore(meta)).toBeCloseTo(10 / 3 / 2, 6)
    expect(videoDetails(meta)).toMatchObject({ fileSize: 10_000_000, width: 1280 })
    expect(qualityScore({ ...meta, duration: 0 })).toBeNull()
  })
})

describe('finding ffmpeg and ffprobe', () => {
  it('searches PATH plus the package-manager folders', () => {
    const dirs = searchPath({ PATH: '/usr/bin:/bin' }, 'darwin')
    expect(dirs).toEqual([
      '/usr/bin',
      '/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/opt/local/bin'
    ])
  })

  it('finds executables and reports missing ones', async () => {
    if (process.platform === 'win32') return
    const dir = scratch()
    mkdirSync(path.join(dir, 'bin'))
    const tool = path.join(dir, 'bin', 'ffprobe')
    writeFileSync(tool, '#!/bin/sh\n', { mode: 0o755 })
    writeFileSync(path.join(dir, 'bin', 'ffmpeg'), '', { mode: 0o644 }) // not executable
    expect(await findTool('ffprobe', [path.join(dir, 'bin')])).toBe(tool)
    expect(await findTool('ffmpeg', [path.join(dir, 'bin')])).toBeNull()
    expect(missingTools({ ffmpeg: null, ffprobe: tool })).toEqual(['ffmpeg'])
  })
})
