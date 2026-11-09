import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach } from 'vitest'
import { Library, type LibraryOptions } from '../src/main/library/library'
import type { Tools } from '../src/main/library/preview'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A scratch folder under /tmp/pvorg-desktop-test-*, removed after the test. */
export function scratch(): string {
  const base = process.platform === 'win32' ? os.tmpdir() : '/tmp'
  const root = mkdtempSync(path.join(base, 'pvorg-desktop-test-'))
  roots.push(root)
  return root
}

export const NO_TOOLS: Tools = { ffmpeg: null, ffprobe: null }

/** A deterministic random source, so shuffles are reproducible. */
export function seeded(seed = 42): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

export class TestLibrary {
  readonly videos: string
  readonly galleries: string
  readonly config: string

  constructor(readonly root: string = scratch()) {
    this.videos = path.join(root, 'videos')
    this.galleries = path.join(root, 'galleries')
    this.config = path.join(root, 'pvorg.json')
    mkdirSync(this.videos, { recursive: true })
    mkdirSync(this.galleries, { recursive: true })
  }

  addVideo(name: string, { sheet = false }: { sheet?: boolean } = {}): this {
    writeFileSync(path.join(this.videos, name), '')
    if (sheet) this.addSheet(name)
    return this
  }

  addSheet(name: string): this {
    mkdirSync(path.join(this.videos, 'img'), { recursive: true })
    writeFileSync(path.join(this.videos, 'img', `${name}.jpg`), 'jpeg')
    return this
  }

  addGallery(name: string, images = 2): this {
    const folder = path.join(this.galleries, name)
    mkdirSync(folder, { recursive: true })
    for (let i = 1; i <= images; i++) writeFileSync(path.join(folder, `image_${i}.jpg`), 'jpeg')
    return this
  }

  writeConfig(data: Record<string, unknown> = {}): this {
    const config = {
      videosPath: this.videos,
      galleriesPath: this.galleries,
      tags: ['4k', 'night', 'outdoor'],
      videoRelations: {},
      ...data
    }
    writeFileSync(this.config, JSON.stringify(config, null, 2) + '\n')
    return this
  }

  writeRaw(text: string): this {
    writeFileSync(this.config, text)
    return this
  }

  read(): Record<string, unknown> {
    return JSON.parse(readFileSync(this.config, 'utf8'))
  }

  text(): string {
    return readFileSync(this.config, 'utf8')
  }

  async open(options: Partial<LibraryOptions> = {}): Promise<Library> {
    const library = new Library({
      configPath: () => this.config,
      preprocess: false,
      random: seeded(),
      findTools: async () => NO_TOOLS,
      ...options
    })
    await library.load().done
    return library
  }
}

let ffmpegAvailable: boolean | null = null

export function hasFfmpeg(): boolean {
  if (ffmpegAvailable === null) {
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
      execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
      ffmpegAvailable = true
    } catch {
      ffmpegAvailable = false
    }
  }
  return ffmpegAvailable
}

/** A short synthetic video made with ffmpeg. */
export function makeVideo(file: string, seconds = 3, size = '320x180'): void {
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=s=${size}:r=24:d=${seconds}`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      file
    ],
    { stdio: 'ignore' }
  )
}
