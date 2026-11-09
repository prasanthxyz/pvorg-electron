import { useEffect, useRef } from 'react'
import type { Command, MenuState } from '../api/types'
import { isMenuOpen } from '../components/Menu'
import { createStore } from '../state/store'

/**
 * Keyboard and menu commands (SPEC §7.1):
 * - typing always wins: no single-key shortcut acts while a text field has focus;
 * - nothing app-level acts while a dialog or menu is open;
 * - page commands are scoped to their page (pages register a handler while mounted);
 * - shortcuts with ⌘ / Ctrl belong to the native menu, which sends the same commands.
 */
export type PageCommandHandler = (command: Command) => boolean

let pageHandler: PageCommandHandler | null = null

export function isEditable(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable) return true
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true
  if (element instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file'].includes(
      element.type
    )
  }
  return false
}

/** Controls whose own keyboard behavior wins for Space and the arrow keys. */
function ownsKey(element: Element | null, key: string): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (key === ' ' || key === 'Enter') {
    return (
      element instanceof HTMLButtonElement ||
      element instanceof HTMLAnchorElement ||
      element instanceof HTMLInputElement ||
      element.getAttribute('role') === 'button'
    )
  }
  if (key.startsWith('Arrow')) {
    return (
      element instanceof HTMLInputElement ||
      ['slider', 'radio', 'tab', 'menuitem', 'option'].includes(element.getAttribute('role') ?? '')
    )
  }
  return false
}

/** Register the current page's command handler. It returns true when it handled the command. */
export function usePageCommands(handler: PageCommandHandler): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const wrapped: PageCommandHandler = (command) => ref.current(command)
    pageHandler = wrapped
    return () => {
      if (pageHandler === wrapped) pageHandler = null
    }
  }, [])
}

export function runPageCommand(command: Command): boolean {
  return pageHandler?.(command) ?? false
}

export function isModalOpen(): boolean {
  return !!document.querySelector('dialog[open]') || isMenuOpen()
}

/** The single-key shortcuts as commands. Delete means Exclude in the viewer, Delete in the Library. */
export function keyCommands(key: string): Command[] {
  switch (key.length === 1 ? key.toLowerCase() : key) {
    case 'v':
      return [{ type: 'navigate', path: '/' }]
    case 'c':
      return [{ type: 'navigate', path: '/filters' }]
    case 'p':
      return [{ type: 'toggleMode' }]
    case 'b':
      return [{ type: 'previous' }]
    case 'n':
      return [{ type: 'next' }]
    case 'Backspace':
      return [{ type: 'exclude' }]
    case 'Delete':
      return [{ type: 'exclude' }, { type: 'deleteSelection' }]
    case ' ':
      return [{ type: 'playPause' }]
    case 'ArrowLeft':
      return [{ type: 'skipBack' }]
    case 'ArrowRight':
      return [{ type: 'skipForward' }]
    case 'ArrowUp':
      return [{ type: 'volumeUp' }]
    case 'ArrowDown':
      return [{ type: 'volumeDown' }]
    case 'm':
      return [{ type: 'mute' }]
    case 'f':
      return [{ type: 'fullScreen' }]
    case 'Escape':
      return [{ type: 'deselectAll' }]
    default:
      return /^[0-9]$/.test(key) ? [{ type: 'jump', tenth: Number(key) }] : []
  }
}

export function installKeyboard(
  navigate: (path: string) => void,
  canNavigate: () => boolean
): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (isModalOpen()) return
    const active = document.activeElement
    if (isEditable(active) || ownsKey(active, e.key)) return
    for (const command of keyCommands(e.key)) {
      if (command.type === 'navigate') {
        if (!canNavigate()) return
        e.preventDefault()
        navigate(command.path)
        return
      }
      if (runPageCommand(command)) {
        e.preventDefault()
        return
      }
    }
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}

/** Bits of state the pages contribute to the native menu. */
export const menuBits = createStore<Partial<MenuState>>({})

export function setMenuBits(bits: Partial<MenuState>): void {
  menuBits.set((current) => {
    const next = { ...current, ...bits }
    return JSON.stringify(next) === JSON.stringify(current) ? current : next
  })
}
