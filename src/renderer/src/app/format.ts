/** "1 video", "3 videos" with locale number formatting (SPEC §2). */
export function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
}

/** "0:07", "12:34", "1:02:03" */
export function timecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Case- and diacritic-insensitive comparison form. */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase()
}

export function matches(query: string, fields: string[]): boolean {
  const q = fold(query.trim())
  return !q || fields.some((field) => fold(field).includes(q))
}

/** "Jane Doe" — the humanized form of a filename token. */
export function humanize(token: string): string {
  return token
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function joinNames(names: string[]): string {
  return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names)
}

/** "1.2 GB", "340 MB" — decimal units, as file browsers show them. */
export function fileSize(bytes: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[unit]}`
}

export function frameRate(fps: number): string {
  return `${fps.toLocaleString(undefined, { maximumFractionDigits: 2 })} fps`
}

export function quality(mbps: number): string {
  return `${mbps.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} Mbps`
}

export interface DetailParts {
  duration: string
  resolution: string
  frameRate: string
  size: string
  quality: string | null
}

export function detailParts(d: {
  duration: number
  width: number
  height: number
  fps: number
  fileSize: number
  quality: number | null
}): DetailParts {
  return {
    duration: timecode(d.duration),
    resolution: d.width && d.height ? `${d.width} × ${d.height}` : '—',
    frameRate: d.fps ? frameRate(d.fps) : '—',
    size: fileSize(d.fileSize),
    quality: d.quality === null ? null : quality(d.quality)
  }
}
