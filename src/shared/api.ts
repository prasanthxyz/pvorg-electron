/**
 * The typed IPC surface between the renderer and the main process. The preload script
 * exposes `window.pvorg`; every method maps to an `ipcMain.handle` channel `pvorg:<name>`.
 */

import type {
  AppInfo,
  Appearance,
  CleanupPreview,
  Command,
  FilterKey,
  FiltersState,
  ImportPreview,
  LibraryState,
  MappingKind,
  MappingState,
  MenuState,
  RevealTarget,
  Settings,
  Status,
  TriState,
  ViewerState
} from './types'

export interface PvorgApi {
  appInfo(): AppInfo
  status(): Status
  reload(): { started: boolean }
  settings(): Settings
  setAppearance(choice: Appearance): Settings
  setSidebarHidden(hidden: boolean): { hidden: boolean }
  chooseLibraryFile(): { chosen: boolean }
  useDefaultLibrary(): { changed: boolean }

  viewer(): ViewerState
  move(delta: number): ViewerState
  goto(index: number): ViewerState
  exclude(filename: string, gallery: string): { exclusionId: string; viewer: ViewerState }
  restore(exclusionId: string): { viewer: ViewerState }

  filters(): FiltersState
  setFilters(update: Partial<Record<FilterKey, string[]>>): FiltersState
  resetFilters(): FiltersState

  library(): LibraryState
  deleteVideos(filenames: string[]): { deleted: number; errors: string[] }
  regenerateSheet(filename: string): { ok: boolean }

  mapping(kind: MappingKind): MappingState
  saveMapping(
    kind: MappingKind,
    changes: Record<string, Record<string, TriState>>
  ): {
    saved: number
  }
  addTags(input: string): { added: string[]; skipped: string[] }
  tagDecisionCount(tag: string): { count: number }
  removeTag(tag: string): { removedDecisions: number }

  cleanupPreview(): CleanupPreview
  removeStale(entries: string[]): { removed: number }

  chooseImportFile(): { file: string | null }
  importPreview(file: string): ImportPreview
  importApply(file: string): ImportPreview

  reveal(target: RevealTarget): { ok: boolean }
  openInDefaultApp(filename: string): { ok: boolean }
  setMenuState(state: MenuState): void
}

export type Method = keyof PvorgApi
export const METHODS: readonly Method[] = [
  'appInfo',
  'status',
  'reload',
  'settings',
  'setAppearance',
  'setSidebarHidden',
  'chooseLibraryFile',
  'useDefaultLibrary',
  'viewer',
  'move',
  'goto',
  'exclude',
  'restore',
  'filters',
  'setFilters',
  'resetFilters',
  'library',
  'deleteVideos',
  'regenerateSheet',
  'mapping',
  'saveMapping',
  'addTags',
  'tagDecisionCount',
  'removeTag',
  'cleanupPreview',
  'removeStale',
  'chooseImportFile',
  'importPreview',
  'importApply',
  'reveal',
  'openInDefaultApp',
  'setMenuState'
]

/** Async versions of every method, as the renderer sees them. */
export type RemoteApi = {
  [K in Method]: (...args: Parameters<PvorgApi[K]>) => Promise<ReturnType<PvorgApi[K]>>
}

export interface Bridge {
  invoke<K extends Method>(
    method: K,
    ...args: Parameters<PvorgApi[K]>
  ): Promise<ReturnType<PvorgApi[K]>>
  onStatus(listener: (status: Status) => void): () => void
  onCommand(listener: (command: Command) => void): () => void
}

/** Errors cross IPC as plain data, so the renderer can rethrow them with their message. */
export type Envelope<T> = { ok: true; value: T } | { ok: false; error: string; code?: string }
