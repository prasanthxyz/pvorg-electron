/**
 * The only bridge between the sandboxed renderer and the main process. It exposes a
 * small typed API: named IPC calls and two event subscriptions, never ipcRenderer itself.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { type Bridge, type Envelope, METHODS, type Method } from '../shared/api'
import type { Command, Status } from '../shared/types'

const allowed = new Set<string>(METHODS)

const bridge: Bridge = {
  async invoke(method: Method, ...args: unknown[]) {
    if (!allowed.has(method)) throw new Error(`Unknown method: ${String(method)}`)
    const result = (await ipcRenderer.invoke(`pvorg:${method}`, ...args)) as Envelope<never>
    if (!result.ok) {
      const error = new Error(result.error)
      if (result.code) error.name = result.code
      throw error
    }
    return result.value
  },
  onStatus(listener: (status: Status) => void) {
    const handler = (_: IpcRendererEvent, status: Status): void => listener(status)
    ipcRenderer.on('pvorg:status', handler)
    return () => ipcRenderer.removeListener('pvorg:status', handler)
  },
  onCommand(listener: (command: Command) => void) {
    const handler = (_: IpcRendererEvent, command: Command): void => listener(command)
    ipcRenderer.on('pvorg:command', handler)
    return () => ipcRenderer.removeListener('pvorg:command', handler)
  }
} as Bridge

contextBridge.exposeInMainWorld('pvorg', bridge)
