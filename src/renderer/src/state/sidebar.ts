import { api } from '../api/client'
import { isModalOpen } from '../app/shortcuts'
import { createStore } from './store'

/**
 * Hiding the sidebar (SPEC §4.1). The main process remembers the choice with the other
 * preferences and shows it in View › Hide / Show Sidebar; the page owns the live state, so the
 * button, the menu item and its shortcut all toggle through `toggleSidebar`.
 */

/** Whether the sidebar is hidden; null until the saved choice has loaded. */
export const sidebarHidden = createStore<boolean | null>(null)

/** Below this width navigation is a drawer, which keeps working as before (SPEC §4.1). */
const narrowQuery = window.matchMedia('(max-width: 899px)')
export const narrowWindow = createStore(narrowQuery.matches)
narrowQuery.addEventListener('change', () => narrowWindow.set(narrowQuery.matches))

/**
 * True while the sidebar slides in or out (SPEC §8.5). The transition applies only then, so
 * resizing the window across a breakpoint never animates the sidebar's width.
 */
export const sidebarAnimating = createStore(false)
let animationTimer = 0

export const SIDEBAR_ID = 'sidebar'
export const SIDEBAR_TOGGLE_ID = 'sidebar-toggle'

export async function loadSidebar(): Promise<void> {
  try {
    const { sidebarHidden: hidden } = await api.settings()
    sidebarHidden.set((current) => current ?? hidden)
  } catch {
    sidebarHidden.set((current) => current ?? false)
  }
}

export function toggleSidebar(): void {
  if (narrowWindow.get() || sidebarHidden.get() === null || isModalOpen()) return
  const hidden = !sidebarHidden.get()
  // Focus would be lost inside a hidden sidebar: it moves to the toggle that brings it back.
  if (hidden && document.getElementById(SIDEBAR_ID)?.contains(document.activeElement)) {
    document.getElementById(SIDEBAR_TOGGLE_ID)?.focus()
  }
  window.clearTimeout(animationTimer)
  sidebarAnimating.set(true)
  animationTimer = window.setTimeout(() => sidebarAnimating.set(false), 320)
  sidebarHidden.set(hidden)
  void api.setSidebarHidden(hidden).catch(() => undefined)
}
