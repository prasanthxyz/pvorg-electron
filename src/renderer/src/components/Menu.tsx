import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createStore, useStore } from '../state/store'
import { Icon, type IconName } from './Icon'

export type MenuEntry =
  | {
      label: string
      onSelect: () => void
      icon?: IconName
      destructive?: boolean
      disabled?: boolean
      /** A choice in a group: shows a check when selected. */
      checked?: boolean
    }
  | { heading: string }
  | { separator: true }

interface OpenMenu {
  entries: MenuEntry[]
  /** Point (context menus) or the trigger's rectangle. */
  at: { x: number; y: number } | DOMRect
  label: string
  returnFocus: Element | null
}

const menuStore = createStore<OpenMenu | null>(null)
const ITEMS = '[role^="menuitem"]:not([disabled])'

export function openMenuAt(
  event: { clientX: number; clientY: number; preventDefault(): void },
  label: string,
  entries: MenuEntry[]
): void {
  event.preventDefault()
  menuStore.set({
    entries,
    label,
    at: { x: event.clientX, y: event.clientY },
    returnFocus: document.activeElement
  })
}

export function openMenuFrom(trigger: HTMLElement, label: string, entries: MenuEntry[]): void {
  menuStore.set({ entries, label, at: trigger.getBoundingClientRect(), returnFocus: trigger })
}

/** Keyboard users reach context menus with the Menu key or Shift+F10 too (the browser fires `contextmenu`). */
export function MenuHost() {
  const menu = useStore(menuStore)
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  const close = (restoreFocus = true) => {
    const returnTo = menuStore.get()?.returnFocus as HTMLElement | null
    menuStore.set(null)
    setPosition(null)
    if (restoreFocus) returnTo?.focus?.()
  }

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    const margin = 8
    let left: number
    let top: number
    if ('width' in menu.at) {
      left = menu.at.left
      top = menu.at.bottom + 4
      if (top + height > window.innerHeight - margin) top = menu.at.top - height - 4
    } else {
      left = menu.at.x
      top = menu.at.y
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
    setPosition({ left, top })
  }, [menu])

  useEffect(() => {
    if (!menu || !position) return
    ref.current?.querySelector<HTMLElement>(ITEMS)?.focus()
  }, [menu, position])

  useEffect(() => {
    if (!menu) return
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close(false)
    }
    const onDismiss = () => close(false)
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('resize', onDismiss)
    window.addEventListener('blur', onDismiss)
    return () => {
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('resize', onDismiss)
      window.removeEventListener('blur', onDismiss)
    }
  }, [menu])

  if (!menu) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next =
        e.key === 'ArrowDown'
          ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length
      items[next]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus()
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  return createPortal(
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={menu.label}
      style={position ? { left: position.left, top: position.top } : { visibility: 'hidden' }}
      onKeyDown={onKeyDown}
    >
      {menu.entries.map((entry, i) => {
        if ('separator' in entry)
          return <div key={i} className="menu__separator" role="separator" />
        if ('heading' in entry)
          return (
            <div key={i} className="menu__heading" role="presentation">
              {entry.heading}
            </div>
          )
        return (
          <button
            key={i}
            type="button"
            role={entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={entry.checked}
            className={`menu__item${entry.destructive ? ' menu__item--destructive' : ''}`}
            disabled={entry.disabled}
            onClick={() => {
              close()
              entry.onSelect()
            }}
          >
            {entry.checked ? (
              <Icon name="check" size={16} />
            ) : entry.icon ? (
              <Icon name={entry.icon} size={16} />
            ) : (
              <span className="menu__spacer" />
            )}
            {entry.label}
          </button>
        )
      })}
    </div>,
    document.body
  )
}

export function isMenuOpen(): boolean {
  return menuStore.get() !== null
}
