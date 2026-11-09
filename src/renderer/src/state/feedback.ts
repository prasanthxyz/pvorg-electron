import { createStore } from './store'

/* ---- Toasts: brief confirmation of completed actions (SPEC §7.2) ---- */

export interface Toast {
  id: number
  message: string
  icon: 'check' | 'trash' | 'thumbsDown'
  action?: { label: string; run: () => void }
}

export const toast = createStore<Toast | null>(null)
let toastId = 0
let toastTimer: number | undefined

export function showToast(
  message: string,
  icon: Toast['icon'] = 'check',
  action?: Toast['action']
): void {
  const next = { id: ++toastId, message, icon, action }
  toast.set(next)
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(
    () => {
      if (toast.get()?.id === next.id) toast.set(null)
    },
    action ? 6000 : 2600
  )
}

export function dismissToast(): void {
  window.clearTimeout(toastTimer)
  toast.set(null)
}

/* ---- Alerts: errors need acknowledgement ---- */

export interface Alert {
  title: string
  message: string
}

export const alert = createStore<Alert | null>(null)

export function showError(title: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  alert.set({ title, message })
}

/* ---- Undo / redo for reversible actions (Exclude Pairing) ---- */

export interface UndoEntry {
  label: string
  undo: () => Promise<UndoEntry | void>
}

interface UndoState {
  undo: UndoEntry[]
  redo: UndoEntry[]
}

export const undoState = createStore<UndoState>({ undo: [], redo: [] })

/** Record an action. `undo` performs the inverse and returns the entry that redoes it. */
export function pushUndo(entry: UndoEntry): void {
  undoState.set((s) => ({ undo: [...s.undo, entry], redo: [] }))
}

async function step(from: 'undo' | 'redo'): Promise<void> {
  const s = undoState.get()
  const entry = s[from].at(-1)
  if (!entry) return
  undoState.set({ ...s, [from]: s[from].slice(0, -1) })
  try {
    const inverse = await entry.undo()
    if (inverse) {
      const to = from === 'undo' ? 'redo' : 'undo'
      undoState.set((current) => ({ ...current, [to]: [...current[to], inverse] }))
    }
  } catch (error) {
    showError(from === 'undo' ? 'Couldn’t Undo' : 'Couldn’t Redo', error)
  }
}

export const undo = () => step('undo')
export const redo = () => step('redo')

/* ---- Data version: bumped after any mutation so pages refetch ---- */

export const dataVersion = createStore(0)
export const bumpData = () => dataVersion.set((v) => v + 1)
