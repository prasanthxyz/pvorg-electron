/**
 * IPC handlers: one `pvorg:<method>` channel per API method. Every handler checks that the
 * call comes from the app's own page and validates its arguments; the renderer never
 * passes file paths except ones the user just chose in a native dialog.
 */

import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { Envelope, Method, PvorgApi } from '../shared/api'
import type {
  Appearance,
  MenuState,
  RevealTarget,
  Settings,
  Status,
  TriState
} from '../shared/types'
import type { Library } from './library/library'
import type { Kind } from './library/relations'
import * as payloads from './payloads'
import type { SettingsStore } from './settings'

export interface IpcContext {
  library: Library
  settings: SettingsStore
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
  applyAppearance: (choice: Appearance) => void
  /** A preference the menu shows changed. */
  onPreferences: () => void
  onMenuState: (state: MenuState) => void
  /** Files the user picked for import in this session; only these may be imported. */
  importFiles: Set<string>
}

class ValidationError extends Error {}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length > 4096) throw new ValidationError(`Invalid ${name}`)
  return value
}

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length > 100_000) throw new ValidationError(`Invalid ${name}`)
  return value.map((v) => string(v, name))
}

function integer(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new ValidationError(`Invalid ${name}`)
  return value
}

function kind(value: unknown): Kind {
  if (value !== 'galleries' && value !== 'tags') throw new ValidationError('Invalid mapping kind')
  return value
}

function changes(value: unknown): Record<string, Record<string, TriState>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Invalid changes')
  }
  const result: Record<string, Record<string, TriState>> = {}
  for (const [filename, cells] of Object.entries(value)) {
    if (typeof cells !== 'object' || cells === null || Array.isArray(cells)) {
      throw new ValidationError('Invalid changes')
    }
    const kept: Record<string, TriState> = {}
    for (const [column, state] of Object.entries(cells)) {
      if (state !== 'yes' && state !== 'no' && state !== 'undecided') {
        throw new ValidationError('Invalid changes')
      }
      kept[column] = state
    }
    result[filename] = kept
  }
  return result
}

function revealTarget(value: unknown): RevealTarget {
  const v = value as Record<string, unknown>
  switch (v?.kind) {
    case 'config':
    case 'videos':
    case 'galleries':
      return { kind: v.kind }
    case 'video':
      return { kind: 'video', filename: string(v.filename, 'filename') }
    case 'gallery':
      return { kind: 'gallery', name: string(v.name, 'gallery') }
    default:
      throw new ValidationError('Invalid reveal target')
  }
}

export function statusPayload(ctx: IpcContext): Status {
  const { library } = ctx
  const s = library.status
  const file = ctx.settings.configPath().file
  return {
    phase: s.phase,
    step: s.step,
    detail: s.detail,
    fraction: s.fraction,
    error: s.error,
    missingTools: s.missingTools,
    configPath: file,
    configExists: existsSync(file),
    revision: library.revision,
    library: { videos: library.videos.length, galleries: library.galleries.length }
  }
}

function settingsPayload(ctx: IpcContext): Settings {
  const { file, source } = ctx.settings.configPath()
  const config = ctx.library.config
  return {
    configPath: file,
    configSource: source,
    configExists: existsSync(file),
    videosPath: config?.videosPath ?? null,
    galleriesPath: config?.galleriesPath ?? null,
    appearance: ctx.settings.get().appearance,
    sidebarHidden: ctx.settings.get().sidebarHidden,
    tools: { ...ctx.library.tools }
  }
}

function windowOf(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined
}

type Handlers = {
  [K in Method]: (
    event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => ReturnType<PvorgApi[K]> | Promise<ReturnType<PvorgApi[K]>>
}

export function registerIpc(ctx: IpcContext): void {
  const { library } = ctx
  const ready = (): void => {
    if (!library.ready) throw new Error('The library is still loading.')
  }

  const handlers: Handlers = {
    appInfo: () => ({
      platform: process.platform as 'darwin' | 'win32' | 'linux',
      version: app.getVersion(),
      name: app.getName()
    }),
    status: () => statusPayload(ctx),
    reload: () => ({ started: library.load().started }),
    settings: () => settingsPayload(ctx),
    setAppearance: async (_, choice) => {
      if (choice !== 'system' && choice !== 'light' && choice !== 'dark') {
        throw new ValidationError('Invalid appearance')
      }
      await ctx.settings.update({ appearance: choice })
      ctx.applyAppearance(choice)
      return settingsPayload(ctx)
    },
    setSidebarHidden: async (_, hidden) => {
      if (typeof hidden !== 'boolean') throw new ValidationError('Invalid sidebar state')
      await ctx.settings.update({ sidebarHidden: hidden })
      ctx.onPreferences()
      return { hidden }
    },
    chooseLibraryFile: async (event) => {
      const current = ctx.settings.configPath().file
      const options: Electron.OpenDialogOptions = {
        title: 'Choose Library File',
        buttonLabel: 'Choose',
        defaultPath: existsSync(current) ? current : os.homedir(),
        properties: ['openFile'],
        filters: [{ name: 'PP Video Organizer library', extensions: ['json'] }]
      }
      const win = windowOf(event)
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || !result.filePaths[0]) return { chosen: false }
      await ctx.settings.update({ libraryFile: path.resolve(result.filePaths[0]) })
      library.reloadSoon()
      return { chosen: true }
    },
    useDefaultLibrary: async () => {
      if (!ctx.settings.get().libraryFile) return { changed: false }
      await ctx.settings.update({ libraryFile: null })
      library.reloadSoon()
      return { changed: true }
    },

    viewer: () => (ready(), payloads.viewerState(library)),
    move: async (_, delta) => {
      ready()
      await library.move(integer(delta, 'delta'))
      return payloads.viewerState(library)
    },
    goto: async (_, index) => {
      ready()
      await library.goto(integer(index, 'index'))
      return payloads.viewerState(library)
    },
    exclude: async (_, filename, gallery) => {
      ready()
      const exclusion = await library.excludePairing(
        string(filename, 'filename'),
        string(gallery, 'gallery')
      )
      return { exclusionId: exclusion.id, viewer: payloads.viewerState(library) }
    },
    restore: async (_, id) => {
      ready()
      await library.restorePairing(string(id, 'exclusion'))
      return { viewer: payloads.viewerState(library) }
    },

    filters: () => (ready(), payloads.filtersState(library)),
    setFilters: async (_, update) => {
      ready()
      const u = (update ?? {}) as Record<string, unknown>
      await library.setFilters({
        galleries: u.galleries === undefined ? undefined : strings(u.galleries, 'galleries'),
        studios: u.studios === undefined ? undefined : strings(u.studios, 'studios'),
        tags: u.tags === undefined ? undefined : strings(u.tags, 'tags'),
        cast: u.cast === undefined ? undefined : strings(u.cast, 'cast')
      })
      return payloads.filtersState(library)
    },
    resetFilters: async () => {
      ready()
      await library.resetFilters()
      return payloads.filtersState(library)
    },

    library: () => (ready(), payloads.libraryState(library)),
    deleteVideos: async (_, filenames) => (
      ready(),
      library.deleteVideos(strings(filenames, 'filenames'))
    ),
    regenerateSheet: async (_, filename) => {
      ready()
      return { ok: await library.regenerateSheet(string(filename, 'filename')) }
    },

    mapping: (_, k) => (
      ready(),
      payloads.mappingState(library, kind(k), ctx.settings.configPath().file)
    ),
    saveMapping: async (_, k, c) => {
      ready()
      return { saved: await library.saveMappings(kind(k), changes(c)) }
    },
    addTags: async (_, input) => (ready(), library.addTags(string(input, 'tags'))),
    tagDecisionCount: (_, tag) => (
      ready(),
      { count: library.tagDecisionCount(string(tag, 'tag')) }
    ),
    removeTag: async (_, tag) => {
      ready()
      return { removedDecisions: await library.removeTag(string(tag, 'tag')) }
    },

    cleanupPreview: async () => (ready(), library.stalePreview()),
    removeStale: async (_, entries) => (
      ready(),
      { removed: await library.removeStale(strings(entries, 'entries')) }
    ),

    chooseImportFile: async (event) => {
      const options: Electron.OpenDialogOptions = {
        title: 'Import from pvorg.yml',
        buttonLabel: 'Review Import',
        defaultPath: path.join(os.homedir(), 'pvorg.yml'),
        properties: ['openFile'],
        filters: [{ name: 'pvorg.yml', extensions: ['yml', 'yaml'] }]
      }
      const win = windowOf(event)
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      const file = result.canceled ? null : (result.filePaths[0] ?? null)
      if (file) ctx.importFiles.add(path.resolve(file))
      return { file: file ? path.resolve(file) : null }
    },
    importPreview: async (_, file) => {
      ready()
      const chosen = allowedImport(ctx, string(file, 'file'))
      return payloads.importPreview(chosen, await library.importPreview(chosen))
    },
    importApply: async (_, file) => {
      ready()
      const chosen = allowedImport(ctx, string(file, 'file'))
      return payloads.importPreview(chosen, await library.importApply(chosen))
    },

    reveal: (_, target) => {
      const file = revealPath(ctx, revealTarget(target))
      if (!file || !existsSync(file)) return { ok: false }
      shell.showItemInFolder(file)
      return { ok: true }
    },
    openInDefaultApp: async (_, filename) => {
      ready()
      const name = string(filename, 'filename')
      if (!library.video(name)) return { ok: false }
      const error = await shell.openPath(path.join(library.config!.videosPath, name))
      if (error) throw new Error(error)
      return { ok: true }
    },
    setMenuState: (_, state) => {
      ctx.onMenuState(state as MenuState)
    }
  }

  for (const [method, handler] of Object.entries(handlers)) {
    ipcMain.handle(`pvorg:${method}`, async (event, ...args): Promise<Envelope<unknown>> => {
      if (!ctx.isTrustedSender(event)) return { ok: false, error: 'Untrusted sender' }
      try {
        return { ok: true, value: await (handler as Handlers[Method])(event, ...args) }
      } catch (error) {
        const e = error as Error
        return { ok: false, error: e?.message || String(error), code: e?.name }
      }
    })
  }
}

function allowedImport(ctx: IpcContext, file: string): string {
  const resolved = path.resolve(file)
  if (!ctx.importFiles.has(resolved)) throw new Error('Choose the file to import first.')
  return resolved
}

function revealPath(ctx: IpcContext, target: RevealTarget): string | null {
  const config = ctx.library.config
  switch (target.kind) {
    case 'config':
      return ctx.settings.configPath().file
    case 'videos':
      return config?.videosPath ?? null
    case 'galleries':
      return config?.galleriesPath ?? null
    case 'video':
      return ctx.library.video(target.filename) && config
        ? path.join(config.videosPath, target.filename)
        : null
    case 'gallery':
      return ctx.library.gallery(target.name) && config
        ? path.join(config.galleriesPath, target.name)
        : null
  }
}
