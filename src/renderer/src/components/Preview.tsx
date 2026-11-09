import { useEffect, useRef, useState } from 'react'
import { createStore, useStore } from '../state/store'
import { Dialog } from './Dialog'
import { IconButton } from './controls'
import { Thumbnail } from './Thumbnail'

/**
 * The large contact-sheet preview (SPEC §6.2, §9). Pointer hover shows a floating
 * panel near the pointer after a short delay; once one is showing, neighbors swap
 * instantly. Touch and keyboard users open the same image in a dialog.
 */
interface Hover {
  src: string
  caption: string | null
  x: number
  y: number
}

const hoverStore = createStore<Hover | null>(null)
const dialogStore = createStore<{ src: string; title: string; caption: string | null } | null>(null)

const DELAY = 220
const WARM = 400
let timer: number | undefined
let lastHidden = 0

const canHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches

export function hoverPreviewHandlers(src: string | null, caption: string | null = null) {
  if (!src) return {}
  return {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse' || !canHover()) return
      const point = { x: e.clientX, y: e.clientY }
      window.clearTimeout(timer)
      const warm = hoverStore.get() !== null || performance.now() - lastHidden < WARM
      timer = window.setTimeout(() => hoverStore.set({ src, caption, ...point }), warm ? 0 : DELAY)
    },
    onPointerMove: (e: React.PointerEvent) => {
      const current = hoverStore.get()
      if (current?.src === src) hoverStore.set({ src, caption, x: e.clientX, y: e.clientY })
    },
    // Clicking (selecting a card, say) dismisses the preview until the pointer re-enters.
    onPointerDown: () => hidePreview(),
    onPointerLeave: () => {
      window.clearTimeout(timer)
      if (hoverStore.get()) lastHidden = performance.now()
      hoverStore.set(null)
    }
  }
}

export function hidePreview(): void {
  window.clearTimeout(timer)
  hoverStore.set(null)
}

export function openPreview(src: string, title: string, caption: string | null = null): void {
  hidePreview()
  dialogStore.set({ src, title, caption })
}

export function PreviewHost() {
  const hover = useStore(hoverStore)
  const dialog = useStore(dialogStore)
  const panel = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!hover) {
      setPlaced(null)
      return
    }
    const width = Math.min(920, window.innerWidth * 0.6)
    const height = (width * 9) / 16 + (hover.caption ? 36 : 0)
    let left = hover.x + 24
    let top = hover.y - height - 18
    if (left + width > window.innerWidth - 8) left = hover.x - width - 24
    if (left < 8) left = 8
    if (top < 8) top = hover.y + 24
    if (top + height > window.innerHeight - 8) top = window.innerHeight - height - 8
    setPlaced({ left, top })
  }, [hover])

  return (
    <>
      {hover && placed && (
        <div
          ref={panel}
          className="hover-preview on-stage"
          style={{
            left: placed.left,
            top: placed.top,
            width: Math.min(920, window.innerWidth * 0.6)
          }}
          aria-hidden="true"
        >
          <img src={hover.src} alt="" decoding="async" />
          {hover.caption && <p className="hover-preview__caption tabular">{hover.caption}</p>}
        </div>
      )}
      <Dialog
        open={dialog !== null}
        onClose={() => dialogStore.set(null)}
        labelledBy="preview-title"
        className="dialog--preview on-stage"
      >
        {dialog && (
          <>
            <div className="preview-dialog__bar">
              <h2 id="preview-title" className="truncate">
                {dialog.title}
              </h2>
              <IconButton
                icon="close"
                label="Close"
                onClick={() => dialogStore.set(null)}
                data-autofocus
              />
            </div>
            <Thumbnail src={dialog.src} fit="contain" eager className="preview-dialog__image" />
            {dialog.caption && <p className="preview-dialog__caption tabular">{dialog.caption}</p>}
          </>
        )}
      </Dialog>
    </>
  )
}
