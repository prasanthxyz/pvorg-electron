import { api } from '../api/client'
import type { Appearance } from '../api/types'
import { createStore } from './store'

export type { Appearance }

/**
 * The choice is stored by the main process, which sets the native theme; the page follows
 * `prefers-color-scheme`, so menus, dialogs and the page always agree. Dark is the default
 * (SPEC §6.5).
 */
export const appearance = createStore<Appearance>('dark')

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

function apply(): void {
  document.documentElement.dataset.theme = systemDark.matches ? 'dark' : 'light'
}

export async function loadAppearance(): Promise<void> {
  appearance.set((await api.settings()).appearance)
  apply()
}

export async function setAppearance(choice: Appearance): Promise<void> {
  appearance.set(choice)
  await api.setAppearance(choice)
  apply()
}

systemDark.addEventListener('change', apply)
apply()
