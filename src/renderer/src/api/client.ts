import type { Bridge, RemoteApi } from '../../../shared/api'
import { METHODS } from '../../../shared/api'

declare global {
  interface Window {
    pvorg: Bridge
  }
}

/** The main process's API: every call is an IPC round trip through the preload bridge. */
export const api = Object.fromEntries(
  METHODS.map((method) => [
    method,
    (...args: unknown[]) =>
      (window.pvorg.invoke as (m: string, ...a: unknown[]) => Promise<unknown>)(method, ...args)
  ])
) as RemoteApi

export const bridge = (): Bridge => window.pvorg
