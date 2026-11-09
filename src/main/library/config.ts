/** pvorg.json: location, schema, loading, normalization and atomic saving (SPEC §1.1, §1.2). */

import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

export const RELATION_FIELDS = ['galleries', 'excludedGalleries', 'tags', 'excludedTags'] as const
export type RelationField = (typeof RELATION_FIELDS)[number]

/** Tri-state decisions for one video. A missing array is `undefined`. */
export type VideoRelation = Partial<Record<RelationField, string[]>>

export interface AppConfig {
  videosPath: string
  galleriesPath: string
  tags: string[]
  videoRelations: Record<string, VideoRelation>
}

/** pvorg.json is missing, unreadable or doesn't match the schema. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export function expandHome(file: string): string {
  if (file === '~') return os.homedir()
  if (file.startsWith('~/') || file.startsWith('~\\')) return path.join(os.homedir(), file.slice(2))
  return file
}

/** `PVORG_CONFIG` if set, else `~/pvorg.json`. */
export function defaultConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PVORG_CONFIG
  if (override) return path.resolve(expandHome(override))
  return path.join(os.homedir(), 'pvorg.json')
}

export async function loadConfig(file: string): Promise<AppConfig> {
  const name = path.basename(file)
  let text: string
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new ConfigError(`The file “${name}” couldn’t be found.`)
    if (code === 'EISDIR') throw new ConfigError(`“${name}” is a folder, not a file.`)
    throw new ConfigError(`The file “${name}” couldn’t be read: ${(error as Error).message}`)
  }
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch (error) {
    const message = (error as Error).message
    const where = /end of JSON/i.test(message) ? ' The file ends before the JSON is complete.' : ''
    throw new ConfigError(`${name} isn’t valid JSON: ${message.replace(/\.$/, '')}.${where}`)
  }
  return validateConfig(data, name)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** Checks the schema and keeps only its keys (§1.2: unknown keys aren't preserved). */
export function validateConfig(data: unknown, name = 'pvorg.json'): AppConfig {
  const invalid = (detail: string): ConfigError => new ConfigError(`${name} isn’t valid: ${detail}`)
  if (!isObject(data)) throw invalid('the top level must be an object.')
  for (const key of ['videosPath', 'galleriesPath', 'tags', 'videoRelations']) {
    if (!(key in data)) throw invalid(`the required key “${key}” is missing.`)
  }
  for (const key of ['videosPath', 'galleriesPath']) {
    if (typeof data[key] !== 'string') throw invalid(`“${key}” must be a string.`)
  }
  if (!isStringArray(data.tags)) throw invalid('“tags” must be a list of strings.')
  if (!isObject(data.videoRelations)) throw invalid('“videoRelations” must be an object.')

  const videoRelations: Record<string, VideoRelation> = {}
  for (const [filename, value] of Object.entries(data.videoRelations)) {
    if (!isObject(value)) throw invalid(`“videoRelations.${filename}” must be an object.`)
    const relation: VideoRelation = {}
    for (const field of RELATION_FIELDS) {
      const list = value[field]
      if (list === undefined || list === null) continue
      if (!isStringArray(list)) {
        throw invalid(`“videoRelations.${filename}.${field}” must be a list of strings.`)
      }
      relation[field] = [...list]
    }
    videoRelations[filename] = relation
  }
  return {
    videosPath: data.videosPath as string,
    galleriesPath: data.galleriesPath as string,
    tags: [...data.tags],
    videoRelations
  }
}

/** Missing or null arrays become `[]` (§1.2). Returns how many relations changed. */
export function normalizeRelations(config: AppConfig): number {
  let changed = 0
  for (const relation of Object.values(config.videoRelations)) {
    let touched = false
    for (const field of RELATION_FIELDS) {
      if (relation[field] === undefined) {
        relation[field] = []
        touched = true
      }
    }
    if (touched) changed += 1
  }
  return changed
}

export function emptyRelation(): Required<VideoRelation> {
  return { galleries: [], excludedGalleries: [], tags: [], excludedTags: [] }
}

export function isEmptyRelation(relation: VideoRelation): boolean {
  return RELATION_FIELDS.every((field) => !relation[field]?.length)
}

function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (isObject(value)) {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort(compareCodePoints)) {
      if (value[key] !== undefined) sorted[key] = sortKeys(value[key])
    }
    return sorted
  }
  return value
}

/** UTF-8, pretty-printed, keys sorted, trailing newline. Missing relation arrays stay missing. */
export function serializeConfig(config: AppConfig): string {
  const data = {
    videosPath: config.videosPath,
    galleriesPath: config.galleriesPath,
    tags: config.tags,
    videoRelations: config.videoRelations
  }
  return JSON.stringify(sortKeys(data), null, 2) + '\n'
}

export function serializeJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2) + '\n'
}

/** Writes a temporary file beside the target, flushes it, then renames it over the target. */
export async function atomicWriteFile(file: string, text: string): Promise<void> {
  const dir = path.dirname(file)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(file)}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    const handle = await fs.open(tmp, 'w')
    try {
      await handle.writeFile(text, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.rename(tmp, file)
  } catch (error) {
    await fs.rm(tmp, { force: true })
    throw error
  }
}

export async function saveConfig(config: AppConfig, file: string): Promise<void> {
  await atomicWriteFile(file, serializeConfig(config))
}
