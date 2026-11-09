/** Orphaned asset cleanup (SPEC §3.4): contact sheets in `img/` only; never `sprite/` (Web's). */

import { promises as fs } from 'fs'
import * as path from 'path'

export const SHEET_DIR = 'img'

export function sheetPath(videosPath: string, filename: string): string {
  return path.join(videosPath, SHEET_DIR, `${filename}.jpg`)
}

/** Deletes contact sheets whose video isn't among the valid videos. Returns the files removed. */
export async function cleanupOrphanedSheets(
  videosPath: string,
  validFilenames: Set<string>
): Promise<string[]> {
  const dir = path.join(videosPath, SHEET_DIR)
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const removed: string[] = []
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.jpg') continue
    const videoName = entry.name.slice(0, -'.jpg'.length)
    if (validFilenames.has(videoName)) continue
    try {
      await fs.unlink(path.join(dir, entry.name))
      removed.push(entry.name)
    } catch {
      /* left for the next startup */
    }
  }
  return removed.sort()
}
