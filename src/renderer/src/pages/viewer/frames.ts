/**
 * Scrubber frame previews from a hidden second video element (SPEC §16 Playback), generated
 * asynchronously and cached per second. Requests are coalesced: while one seek is in
 * flight only the latest requested second is queued, so dragging stays responsive.
 */

const WIDTH = 224

export class FrameGrabber {
  private readonly video: HTMLVideoElement
  private readonly canvas = document.createElement('canvas')
  private readonly frames = new Map<number, string>()
  private ready: Promise<boolean>
  private busy = false
  private wanted: number | null = null
  private listeners = new Set<() => void>()
  private disposed = false

  constructor(src: string) {
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    video.src = src
    this.video = video
    this.ready = new Promise((resolve) => {
      video.addEventListener('loadeddata', () => resolve(true), { once: true })
      video.addEventListener('error', () => resolve(false), { once: true })
    })
  }

  /** A cached frame for this second, or the nearest cached one while it is generated. */
  frame(second: number): string | null {
    const exact = this.frames.get(second)
    if (exact) return exact
    this.request(second)
    let best: string | null = null
    let distance = Infinity
    for (const [s, url] of this.frames) {
      const d = Math.abs(s - second)
      if (d < distance) {
        distance = d
        best = url
      }
    }
    return distance <= 5 ? best : null
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private request(second: number): void {
    this.wanted = second
    if (!this.busy) void this.pump()
  }

  private async pump(): Promise<void> {
    this.busy = true
    try {
      if (!(await this.ready)) return
      while (this.wanted !== null && !this.disposed) {
        const second = this.wanted
        this.wanted = null
        if (this.frames.has(second)) continue
        const url = await this.capture(second)
        if (url) {
          this.frames.set(second, url)
          this.listeners.forEach((l) => l())
        }
      }
    } finally {
      this.busy = false
    }
  }

  private capture(second: number): Promise<string | null> {
    const video = this.video
    return new Promise((resolve) => {
      const done = (): void => {
        video.removeEventListener('seeked', done)
        if (this.disposed || !video.videoWidth) return resolve(null)
        const height = Math.round((WIDTH * video.videoHeight) / video.videoWidth)
        this.canvas.width = WIDTH
        this.canvas.height = height
        const context = this.canvas.getContext('2d')
        if (!context) return resolve(null)
        context.drawImage(video, 0, 0, WIDTH, height)
        this.canvas.toBlob(
          (blob) => resolve(blob ? URL.createObjectURL(blob) : null),
          'image/jpeg',
          0.8
        )
      }
      video.addEventListener('seeked', done)
      video.currentTime = Math.min(second + 0.5, Math.max(0, (video.duration || 0) - 0.05))
    })
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
    this.video.removeAttribute('src')
    this.video.load()
    for (const url of this.frames.values()) URL.revokeObjectURL(url)
    this.frames.clear()
  }
}
