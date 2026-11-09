import { api, bridge } from '../api/client'
import type { AppInfo, Status } from '../api/types'
import { bumpData } from './feedback'
import { createStore } from './store'

export const status = createStore<Status | null>(null)
export const appInfo = createStore<AppInfo | null>(null)

let subscribed = false

/** Follow startup progress, pushed by the main process (no polling). */
export async function watchStatus(): Promise<void> {
  if (!subscribed) {
    subscribed = true
    bridge().onStatus((next) => {
      const previous = status.get()
      status.set(next)
      if (next.phase === 'ready' && previous?.phase !== 'ready') bumpData()
    })
  }
  const [info, current] = await Promise.all([api.appInfo(), api.status()])
  appInfo.set(info)
  status.set((s) => s ?? current)
}

export async function refreshStatus(): Promise<void> {
  status.set(await api.status())
}

export async function reloadLibrary(): Promise<void> {
  await api.reload()
}

export function isMac(): boolean {
  const platform = appInfo.get()?.platform
  if (platform) return platform === 'darwin'
  return /mac/i.test(navigator.platform)
}

/** "⌘" on macOS, "Ctrl+" elsewhere. */
export function commandKey(): string {
  return isMac() ? '⌘' : 'Ctrl+'
}

/** The platform's name for revealing a file: Finder, Explorer or the file manager. */
export function revealLabel(): string {
  const platform = appInfo.get()?.platform
  if (platform === 'darwin') return 'Reveal in Finder'
  if (platform === 'win32') return 'Show in Explorer'
  return 'Show in Folder'
}
