/** Pure rules for changing relations in pvorg.json (SPEC §3.3, §3.5, §3.6). */

import { promises as fs } from 'fs'
import * as path from 'path'
import { type AppConfig, emptyRelation, type RelationField, type VideoRelation } from './config'
import { compareCodePoints } from './display'
import { countVideoFiles } from './scanner'

export type Kind = 'galleries' | 'tags'
export type TriState = 'yes' | 'no' | 'undecided'
/** filename → column → new state. */
export type Changes = Record<string, Record<string, TriState>>

export const FIELDS: Record<Kind, [RelationField, RelationField]> = {
  galleries: ['galleries', 'excludedGalleries'],
  tags: ['tags', 'excludedTags']
}

export function triState(
  relation: VideoRelation | undefined,
  kind: Kind,
  column: string
): TriState {
  if (!relation) return 'undecided'
  const [yesField, noField] = FIELDS[kind]
  if (relation[yesField]?.includes(column)) return 'yes'
  if (relation[noField]?.includes(column)) return 'no'
  return 'undecided'
}

/**
 * Applies pending cell changes (§3.3). Known names are written in vocabulary order;
 * unknown values already present are kept after them; the other pair is left as it was,
 * and a relation created here has all four arrays.
 */
export function applyMappingChanges(
  config: AppConfig,
  kind: Kind,
  changes: Changes,
  orderedColumns: string[]
): void {
  const known = new Set(orderedColumns)
  const [yesField, noField] = FIELDS[kind]
  const [otherYes, otherNo] = FIELDS[kind === 'galleries' ? 'tags' : 'galleries']

  for (const [filename, cells] of Object.entries(changes)) {
    const relation: VideoRelation = config.videoRelations[filename] ?? emptyRelation()
    const originalYes = [...(relation[yesField] ?? [])]
    const originalNo = [...(relation[noField] ?? [])]
    const yes = new Set(originalYes)
    const no = new Set(originalNo)

    for (const [column, state] of Object.entries(cells)) {
      if (!known.has(column)) continue
      if (state === 'yes') {
        yes.add(column)
        no.delete(column)
      } else if (state === 'no') {
        no.add(column)
        yes.delete(column)
      } else {
        yes.delete(column)
        no.delete(column)
      }
    }

    relation[yesField] = [
      ...orderedColumns.filter((c) => yes.has(c)),
      ...dedupe(originalYes.filter((c) => !known.has(c) && yes.has(c)))
    ]
    relation[noField] = [
      ...orderedColumns.filter((c) => no.has(c)),
      ...dedupe(originalNo.filter((c) => !known.has(c) && no.has(c)))
    ]
    relation[otherYes] ??= []
    relation[otherNo] ??= []
    config.videoRelations[filename] = relation
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

export interface StalePreview {
  videosPath: string
  videoFileCount: number
  relationCount: number
  staleEntries: string[]
  /** No videos visible while entries exist — a disconnected drive, say. */
  highRisk: boolean
}

async function exists(file: string): Promise<boolean> {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false)
}

export async function stalePreview(config: AppConfig): Promise<StalePreview> {
  const stat = await fs.stat(config.videosPath).catch(() => null)
  if (!stat?.isDirectory()) {
    throw new Error(`The videos folder is missing: ${config.videosPath}`)
  }
  const videoFileCount = await countVideoFiles(config.videosPath)
  const names = Object.keys(config.videoRelations)
  const stale: string[] = []
  for (const name of names) {
    if (!(await exists(path.join(config.videosPath, name)))) stale.push(name)
  }
  stale.sort(compareCodePoints)
  return {
    videosPath: config.videosPath,
    videoFileCount,
    relationCount: names.length,
    staleEntries: stale,
    highRisk: videoFileCount === 0 && names.length > 0
  }
}
