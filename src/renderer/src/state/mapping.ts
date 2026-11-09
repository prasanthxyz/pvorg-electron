import type { MappingKind, TriState } from '../api/types'
import { createStore } from './store'

/** filename → column → new state, only for cells that differ from what is saved. */
export type Pending = Record<string, Record<string, TriState>>

interface Session {
  pending: Pending
  showAll: boolean
  query: string
}

const KEY = (kind: MappingKind) => `pvorg.mapping.${kind}`

function restore(kind: MappingKind): Session {
  // Pending edits survive a browser refresh too, not just page switches.
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY(kind)) ?? 'null')
    if (saved && typeof saved.pending === 'object')
      return { pending: saved.pending, showAll: false, query: '' }
  } catch {
    /* ignore */
  }
  return { pending: {}, showAll: false, query: '' }
}

export const mappingSessions: Record<MappingKind, ReturnType<typeof createStore<Session>>> = {
  galleries: createStore(restore('galleries')),
  tags: createStore(restore('tags'))
}

for (const kind of ['galleries', 'tags'] as const) {
  mappingSessions[kind].subscribe(() => {
    sessionStorage.setItem(
      KEY(kind),
      JSON.stringify({ pending: mappingSessions[kind].get().pending })
    )
  })
}

export function changeCount(pending: Pending): number {
  return Object.values(pending).reduce((total, cells) => total + Object.keys(cells).length, 0)
}

export function setCell(
  kind: MappingKind,
  filename: string,
  column: string,
  state: TriState,
  saved: TriState
): void {
  mappingSessions[kind].set((session) => {
    const cells = { ...(session.pending[filename] ?? {}) }
    if (state === saved) delete cells[column]
    else cells[column] = state
    const pending = { ...session.pending }
    if (Object.keys(cells).length) pending[filename] = cells
    else delete pending[filename]
    return { ...session, pending }
  })
}

export function updateSession(kind: MappingKind, patch: Partial<Session>): void {
  mappingSessions[kind].set((session) => ({ ...session, ...patch }))
}

/** Drop edits for videos or columns that no longer exist. */
export function prune(kind: MappingKind, filenames: Set<string>, columns: Set<string>): void {
  mappingSessions[kind].set((session) => {
    let changed = false
    const pending: Pending = {}
    for (const [filename, cells] of Object.entries(session.pending)) {
      if (!filenames.has(filename)) {
        changed = true
        continue
      }
      const kept = Object.fromEntries(
        Object.entries(cells).filter(([column]) => columns.has(column))
      )
      if (Object.keys(kept).length !== Object.keys(cells).length) changed = true
      if (Object.keys(kept).length) pending[filename] = kept
    }
    return changed ? { ...session, pending } : session
  })
}

export function hasAnyPending(): boolean {
  return (
    changeCount(mappingSessions.galleries.get().pending) +
      changeCount(mappingSessions.tags.get().pending) >
    0
  )
}
