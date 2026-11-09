/**
 * The library the app serves (SPEC Part I): startup pipeline, filters, the ordered
 * combination list with the viewer position, and every operation that writes pvorg.json.
 *
 * Mutations run one at a time, in order, so async file work never interleaves.
 */

import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import * as path from 'path'
import { MetadataCache, type VideoDetails, videoDetails } from './cache'
import { cleanupOrphanedSheets, SHEET_DIR, sheetPath } from './cleanup'
import {
  type AppConfig,
  ConfigError,
  isEmptyRelation,
  loadConfig,
  normalizeRelations,
  saveConfig
} from './config'
import {
  type Combination,
  type Filters,
  galleryPasses,
  generateCombinations,
  type Random,
  videoPasses
} from './combinations'
import { compareCodePoints } from './display'
import { applyImport, type ImportPlan, parseOldLibrary, planImport, ImportError } from './importer'
import { findTools, generateContactSheet, missingTools, probeMetadata, type Tools } from './preview'
import {
  applyMappingChanges,
  type Changes,
  type Kind,
  stalePreview,
  type StalePreview,
  triState,
  type TriState
} from './relations'
import {
  type Gallery,
  makeVideo,
  scanGalleries,
  scanVideos,
  type SkippedFile,
  type Video
} from './scanner'

export type Phase = 'loading' | 'ready' | 'error'

export interface StartupStatus {
  phase: Phase
  step: string
  detail: string | null
  fraction: number | null
  error: string | null
  /** ffmpeg / ffprobe when they can't be found (optional capability, §6.8). */
  missingTools: string[]
}

/** What's needed to undo one Exclude Pairing exactly (§3.6). */
export interface PairingExclusion {
  id: string
  filename: string
  gallery: string
  previousState: TriState
  hadRelation: boolean
  index: number | null
}

export interface DeletionResult {
  deleted: number
  errors: string[]
}

export interface FiltersUpdate {
  galleries?: string[]
  studios?: string[]
  tags?: string[]
  cast?: string[]
}

export interface LibraryOptions {
  configPath: () => string
  /** Generate missing contact sheets and metadata at startup (step 5). */
  preprocess?: boolean
  random?: Random
  findTools?: () => Promise<Tools>
  onStatus?: (status: StartupStatus) => void
  /** Called after anything the pages show has changed. */
  onChange?: () => void
}

export class NotReadyError extends Error {
  constructor() {
    super('The library is still loading.')
    this.name = 'NotReadyError'
  }
}

function loading(
  step: string,
  detail: string | null = null,
  fraction: number | null = null
): StartupStatus {
  return { phase: 'loading', step, detail, fraction, error: null, missingTools: [] }
}

export class Library {
  config: AppConfig | null = null
  configFile: string | null = null
  galleries: Gallery[] = []
  videos: Video[] = []
  skipped: SkippedFile[] = []
  filters: Filters = { galleries: new Set(), studios: new Set(), tags: new Set(), cast: new Set() }
  combinations: Combination[] = []
  position = 0
  revision = 0
  tools: Tools = { ffmpeg: null, ffprobe: null }
  status: StartupStatus = loading('Starting Up')
  readonly exclusions = new Map<string, PairingExclusion>()
  /** Contact sheet modification times, by video filename. */
  private sheets = new Map<string, number>()
  private cache: MetadataCache | null = null
  private run: Promise<void> | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private regenerating = new Set<string>()

  constructor(private readonly options: LibraryOptions) {}

  // ---- Startup (§3.2) ----

  /** Starts a run unless one is in progress. Resolves when that run finishes. */
  load(): { started: boolean; done: Promise<void> } {
    if (this.run) return { started: false, done: this.run }
    const run = this.exclusive(() => this.pipeline()).finally(() => {
      this.run = null
    })
    this.run = run
    return { started: true, done: run }
  }

  get ready(): boolean {
    return this.status.phase === 'ready' && this.config !== null
  }

  private setStatus(status: StartupStatus): void {
    this.status = status
    this.options.onStatus?.(status)
  }

  private async pipeline(): Promise<void> {
    try {
      const file = this.options.configPath()
      this.setStatus(loading('Loading Configuration', file))
      const config = await loadConfig(file)

      this.setStatus(loading('Scanning Library', config.videosPath))
      const galleries = await scanGalleries(config.galleriesPath)
      const { videos, skipped } = await scanVideos(
        config,
        galleries.map((g) => g.name)
      )

      this.setStatus(loading('Updating pvorg.json'))
      if (normalizeRelations(config)) await saveConfig(config, file)

      this.setStatus(loading('Cleaning Up Previews'))
      await cleanupOrphanedSheets(config.videosPath, new Set(videos.map((v) => v.filename)))

      const cache = await MetadataCache.load(path.join(config.videosPath, 'cache.json'))
      const tools = await (this.options.findTools ?? findTools)()
      const missing = missingTools(tools)
      if (this.options.preprocess !== false) {
        if (missing.length) {
          this.setStatus({
            ...loading('Preparing Previews', 'Skipped: contact sheets need ffmpeg and ffprobe'),
            missingTools: missing
          })
        } else {
          await this.preparePreviews(config, videos, tools, cache)
        }
      }

      this.config = config
      this.configFile = file
      this.galleries = galleries
      this.videos = videos
      this.skipped = skipped
      this.cache = cache
      this.tools = tools
      await this.refreshSheets()
      this.filters = this.defaultFilters()
      this.regenerate()
      this.setStatus({
        phase: 'ready',
        step: 'Ready',
        detail: null,
        fraction: null,
        error: null,
        missingTools: missing
      })
    } catch (error) {
      const message =
        error instanceof ConfigError
          ? error.message
          : (error as Error)?.message || String(error) || 'Unknown error'
      this.setStatus({
        phase: 'error',
        step: 'Error',
        detail: null,
        fraction: null,
        error: message,
        missingTools: []
      })
    }
    this.options.onChange?.()
  }

  private async preparePreviews(
    config: AppConfig,
    videos: Video[],
    tools: Tools,
    cache: MetadataCache
  ): Promise<void> {
    let cacheChanged = false
    for (const [index, video] of videos.entries()) {
      this.setStatus(
        loading(
          'Preparing Previews',
          `${index + 1} of ${videos.length} · ${video.filename}`,
          index / Math.max(videos.length, 1)
        )
      )
      const file = path.join(config.videosPath, video.filename)
      await generateContactSheet(tools, file, sheetPath(config.videosPath, video.filename))
      if (!cache.has(video.filename) && tools.ffprobe) {
        const meta = await probeMetadata(tools.ffprobe, file)
        if (meta) {
          cache.set(video.filename, meta)
          cacheChanged = true
        }
      }
    }
    this.setStatus(loading('Preparing Previews', null, 1))
    if (cacheChanged) await cache.save()
  }

  private async refreshSheets(): Promise<void> {
    const sheets = new Map<string, number>()
    if (this.config) {
      const dir = path.join(this.config.videosPath, SHEET_DIR)
      const known = new Set(this.videos.map((v) => v.filename))
      const entries = await fs.readdir(dir).catch(() => [] as string[])
      for (const entry of entries) {
        if (!entry.endsWith('.jpg')) continue
        const filename = entry.slice(0, -4)
        if (!known.has(filename)) continue
        const stat = await fs.stat(path.join(dir, entry)).catch(() => null)
        if (stat?.isFile()) sheets.set(filename, Math.round(stat.mtimeMs))
      }
    }
    this.sheets = sheets
  }

  /** Serializes mutations. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task)
    this.queue = result.catch(() => undefined)
    return result
  }

  private mutate<T>(task: (config: AppConfig, file: string) => Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      const config = this.requireConfig()
      const result = await task(config, this.configFile as string)
      this.revision += 1
      this.options.onChange?.()
      return result
    })
  }

  private requireConfig(): AppConfig {
    if (!this.ready || !this.config) throw new NotReadyError()
    return this.config
  }

  async rescan(resetFilters: boolean): Promise<void> {
    const config = this.requireConfig()
    this.galleries = await scanGalleries(config.galleriesPath)
    const scan = await scanVideos(config, this.galleryNames())
    this.videos = scan.videos
    this.skipped = scan.skipped
    await this.refreshSheets()
    if (resetFilters) this.filters = this.defaultFilters()
    else this.intersectFilters()
    this.regenerate()
  }

  // ---- Vocabularies ----

  galleryNames(): string[] {
    return this.galleries.map((g) => g.name).sort(compareCodePoints)
  }

  allStudios(): string[] {
    return [...new Set(this.videos.map((v) => v.studio))].sort(compareCodePoints)
  }

  allTags(): string[] {
    return [...(this.config?.tags ?? [])].sort(compareCodePoints)
  }

  allCast(): string[] {
    return [...new Set(this.videos.flatMap((v) => v.cast))].sort(compareCodePoints)
  }

  columns(kind: Kind): string[] {
    return kind === 'galleries' ? this.galleryNames() : this.allTags()
  }

  hasSheet(filename: string): boolean {
    return this.sheets.has(filename)
  }

  sheetVersion(filename: string): number | null {
    return this.sheets.get(filename) ?? null
  }

  details(filename: string): VideoDetails | null {
    return videoDetails(this.cache?.get(filename) ?? null)
  }

  video(filename: string): Video | undefined {
    return this.videos.find((v) => v.filename === filename)
  }

  gallery(name: string): Gallery | undefined {
    return this.galleries.find((g) => g.name === name)
  }

  // ---- Filters (§3.1) ----

  defaultFilters(): Filters {
    return {
      galleries: new Set(this.galleries.map((g) => g.name)),
      studios: new Set(this.videos.map((v) => v.studio)),
      tags: new Set(),
      cast: new Set()
    }
  }

  private intersectFilters(): void {
    const f = this.filters
    const keep = (selected: Set<string>, all: string[]): Set<string> =>
      new Set(all.filter((value) => selected.has(value)))
    const galleries = keep(f.galleries, this.galleryNames())
    const studios = keep(f.studios, this.allStudios())
    this.filters = {
      galleries: galleries.size ? galleries : new Set(this.galleryNames()),
      studios: studios.size ? studios : new Set(this.allStudios()),
      tags: keep(f.tags, this.allTags()),
      cast: keep(f.cast, this.allCast())
    }
  }

  filtersAreDefault(): boolean {
    const d = this.defaultFilters()
    const same = (a: Set<string>, b: Set<string>): boolean =>
      a.size === b.size && [...a].every((x) => b.has(x))
    const f = this.filters
    return (
      same(f.galleries, d.galleries) && same(f.studios, d.studios) && !f.tags.size && !f.cast.size
    )
  }

  regenerate(): void {
    this.combinations = generateCombinations(
      this.videos,
      this.galleries,
      this.filters,
      this.options.random
    )
    this.position = 0
    this.revision += 1
  }

  setFilters(update: FiltersUpdate): Promise<void> {
    return this.mutate(async () => {
      const f = this.filters
      this.filters = {
        galleries: update.galleries ? new Set(update.galleries) : f.galleries,
        studios: update.studios ? new Set(update.studios) : f.studios,
        tags: update.tags ? new Set(update.tags) : f.tags,
        cast: update.cast ? new Set(update.cast) : f.cast
      }
      this.regenerate()
    })
  }

  resetFilters(): Promise<void> {
    return this.mutate(async () => {
      this.filters = this.defaultFilters()
      this.regenerate()
    })
  }

  // ---- Viewer ----

  current(): Combination | null {
    if (!this.combinations.length) return null
    return this.combinations[this.position % this.combinations.length]
  }

  move(delta: number): Promise<void> {
    return this.mutate(async () => {
      const total = this.combinations.length
      if (total) this.position = (((this.position + delta) % total) + total) % total
    })
  }

  goto(index: number): Promise<void> {
    return this.mutate(async () => {
      if (Number.isInteger(index) && index >= 0 && index < this.combinations.length) {
        this.position = index
      }
    })
  }

  private indexOf(filename: string, gallery: string): number | null {
    const index = this.combinations.findIndex(
      (c) => c.video.filename === filename && c.gallery.name === gallery
    )
    return index < 0 ? null : index
  }

  /** Recomputes one video's galleries and tags from the config, the way the scanner does. */
  private refreshVideo(filename: string): void {
    const config = this.requireConfig()
    const fresh = makeVideo(filename, config, this.galleryNames())
    const video = this.video(filename)
    if (video) {
      video.relatedGalleries = fresh.relatedGalleries
      video.tags = fresh.tags
    }
  }

  /** Writes No for the gallery and drops just that pairing, keeping order and position (§3.6). */
  excludePairing(filename: string, gallery: string): Promise<PairingExclusion> {
    return this.mutate(async (config, file) => {
      if (!this.video(filename)) throw new Error(`Unknown video: ${filename}`)
      if (!this.gallery(gallery)) throw new Error(`Unknown gallery: ${gallery}`)
      const relation = config.videoRelations[filename]
      const exclusion: PairingExclusion = {
        id: randomUUID(),
        filename,
        gallery,
        previousState: triState(relation, 'galleries', gallery),
        hadRelation: relation !== undefined,
        index: null
      }
      applyMappingChanges(
        config,
        'galleries',
        { [filename]: { [gallery]: 'no' } },
        this.galleryNames()
      )
      await saveConfig(config, file)
      this.refreshVideo(filename)

      const index = this.indexOf(filename, gallery)
      if (index !== null) {
        this.combinations.splice(index, 1)
        if (index < this.position) this.position -= 1
        if (this.position >= this.combinations.length) this.position = 0
      }
      exclusion.index = index
      this.exclusions.set(exclusion.id, exclusion)
      return exclusion
    })
  }

  /** Undoes an exclusion exactly, and puts the pairing back if the filters allow it. */
  restorePairing(id: string): Promise<PairingExclusion> {
    return this.mutate(async (config, file) => {
      const exclusion = this.exclusions.get(id)
      if (!exclusion) throw new Error('That change can no longer be undone.')
      const { filename, gallery } = exclusion
      applyMappingChanges(
        config,
        'galleries',
        { [filename]: { [gallery]: exclusion.previousState } },
        this.galleryNames()
      )
      const relation = config.videoRelations[filename]
      if (!exclusion.hadRelation && relation && isEmptyRelation(relation)) {
        delete config.videoRelations[filename]
      }
      await saveConfig(config, file)
      this.refreshVideo(filename)

      const video = this.video(filename)
      const g = this.gallery(gallery)
      if (
        video &&
        g &&
        this.indexOf(filename, gallery) === null &&
        videoPasses(video, this.filters) &&
        galleryPasses(g, video, this.filters)
      ) {
        const index = Math.min(exclusion.index ?? this.position, this.combinations.length)
        this.combinations.splice(index, 0, { video, gallery: g })
        this.position = index
      }
      this.exclusions.delete(id)
      return exclusion
    })
  }

  // ---- Mapping (§3.3) ----

  saveMappings(kind: Kind, changes: Changes): Promise<number> {
    return this.mutate(async (config, file) => {
      const known = new Set(this.videos.map((v) => v.filename))
      const columns = new Set(this.columns(kind))
      const accepted: Changes = {}
      let count = 0
      for (const [filename, cells] of Object.entries(changes)) {
        if (!known.has(filename)) continue
        const kept: Record<string, TriState> = {}
        for (const [column, state] of Object.entries(cells ?? {})) {
          if (columns.has(column) && ['yes', 'no', 'undecided'].includes(state)) {
            kept[column] = state
          }
        }
        if (Object.keys(kept).length) {
          accepted[filename] = kept
          count += Object.keys(kept).length
        }
      }
      if (!count) return 0
      applyMappingChanges(config, kind, accepted, this.columns(kind))
      await saveConfig(config, file)
      await this.rescan(false)
      return count
    })
  }

  // ---- Deletion (§3.7) ----

  deleteVideos(filenames: string[]): Promise<DeletionResult> {
    return this.mutate(async (config, file) => {
      const known = new Set(this.videos.map((v) => v.filename))
      const cache =
        this.cache ?? (await MetadataCache.load(path.join(config.videosPath, 'cache.json')))
      const result: DeletionResult = { deleted: 0, errors: [] }
      let configChanged = false
      let cacheChanged = false

      for (const filename of [...new Set(filenames)].sort(compareCodePoints)) {
        if (!known.has(filename)) {
          result.errors.push(`Rejected unknown filename: ${filename}`)
          continue
        }
        try {
          await fs.unlink(path.join(config.videosPath, filename))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            // The video is still there, so its decisions and metadata stay too.
            result.errors.push(`Couldn’t delete “${filename}”: ${describe(error)}`)
            continue
          }
        }
        try {
          await fs.unlink(sheetPath(config.videosPath, filename))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            result.errors.push(
              `Couldn’t delete the contact sheet of “${filename}”: ${describe(error)}. It will be removed at the next startup.`
            )
          }
        }
        if (filename in config.videoRelations) {
          delete config.videoRelations[filename]
          configChanged = true
        }
        if (cache.remove(filename)) cacheChanged = true
        result.deleted += 1
      }

      if (configChanged) await saveConfig(config, file)
      if (cacheChanged) await cache.save()
      await this.rescan(true)
      return result
    })
  }

  // ---- Stale entries (§3.5) ----

  stalePreview(): Promise<StalePreview> {
    return this.exclusive(async () => stalePreview(this.requireConfig()))
  }

  /** Removes previewed entries whose video is still missing; nothing else. */
  removeStale(entries: string[]): Promise<number> {
    return this.mutate(async (config, file) => {
      const stillStale = new Set((await stalePreview(config)).staleEntries)
      let removed = 0
      for (const key of entries) {
        if (stillStale.has(key) && key in config.videoRelations) {
          delete config.videoRelations[key]
          removed += 1
        }
      }
      if (removed) {
        await saveConfig(config, file)
        await this.rescan(false)
      }
      return removed
    })
  }

  // ---- Tag vocabulary (§3.9) ----

  tagDecisionCount(tag: string): number {
    const config = this.requireConfig()
    return Object.values(config.videoRelations).filter(
      (r) => r.tags?.includes(tag) || r.excludedTags?.includes(tag)
    ).length
  }

  addTags(input: string): Promise<{ added: string[]; skipped: string[] }> {
    return this.mutate(async (config, file) => {
      const existing = new Set(config.tags.map((t) => t.toLowerCase()))
      const added: string[] = []
      const skipped: string[] = []
      for (const raw of input.split(',')) {
        const name = raw.trim()
        if (!name) continue
        if (existing.has(name.toLowerCase())) {
          skipped.push(name)
          continue
        }
        existing.add(name.toLowerCase())
        added.push(name)
      }
      if (added.length) {
        config.tags.push(...added)
        await saveConfig(config, file)
        await this.rescan(false)
      }
      return { added, skipped }
    })
  }

  removeTag(tag: string): Promise<number> {
    return this.mutate(async (config, file) => {
      if (!config.tags.includes(tag)) throw new Error(`Unknown tag: ${tag}`)
      const decisions = this.tagDecisionCount(tag)
      config.tags = config.tags.filter((t) => t !== tag)
      for (const relation of Object.values(config.videoRelations)) {
        if (relation.tags) relation.tags = relation.tags.filter((t) => t !== tag)
        if (relation.excludedTags)
          relation.excludedTags = relation.excludedTags.filter((t) => t !== tag)
      }
      this.filters.tags.delete(tag)
      await saveConfig(config, file)
      await this.rescan(false)
      return decisions
    })
  }

  // ---- Import from pvorg.yml (§3.10) ----

  private async readPlan(ymlFile: string): Promise<ImportPlan> {
    const config = this.requireConfig()
    let text: string
    try {
      text = await fs.readFile(ymlFile, 'utf8')
    } catch (error) {
      throw new ImportError(`“${path.basename(ymlFile)}” couldn’t be read: ${describe(error)}.`)
    }
    const old = parseOldLibrary(text, path.basename(ymlFile))
    return planImport(old, {
      config,
      videos: this.videos,
      skipped: this.skipped,
      galleryNames: this.galleryNames()
    })
  }

  importPreview(ymlFile: string): Promise<ImportPlan> {
    return this.exclusive(() => this.readPlan(ymlFile))
  }

  /** Recomputes the plan against the current library, then writes it in one atomic save. */
  importApply(ymlFile: string): Promise<ImportPlan> {
    return this.mutate(async (config, file) => {
      const plan = await this.readPlan(ymlFile)
      if (applyImport(config, plan, this.galleryNames())) {
        await saveConfig(config, file)
        await this.rescan(false)
      }
      return plan
    })
  }

  // ---- Regenerate Contact Sheet (§6.8) ----

  isRegenerating(filename: string): boolean {
    return this.regenerating.has(filename)
  }

  /** Replaces a video's contact sheet. Runs outside the mutation queue: it only touches img/. */
  async regenerateSheet(filename: string): Promise<boolean> {
    const config = this.requireConfig()
    if (!this.video(filename)) throw new Error(`Unknown video: ${filename}`)
    if (missingTools(this.tools).length) {
      throw new Error('Contact sheets need ffmpeg and ffprobe, which weren’t found.')
    }
    if (this.regenerating.has(filename)) return false
    this.regenerating.add(filename)
    try {
      const ok = await generateContactSheet(
        this.tools,
        path.join(config.videosPath, filename),
        sheetPath(config.videosPath, filename),
        true
      )
      await this.refreshSheets()
      this.revision += 1
      this.options.onChange?.()
      return ok
    } finally {
      this.regenerating.delete(filename)
    }
  }
}

function describe(error: unknown): string {
  const e = error as NodeJS.ErrnoException
  if (e?.code === 'EACCES' || e?.code === 'EPERM') return 'permission denied'
  if (e?.code === 'EBUSY') return 'the file is in use'
  return e?.message ?? String(error)
}
