import { useEffect, useState, type RefObject } from 'react'

/** Width and scroll position of a scroll container, tracked without re-rendering on every pixel. */
export function useScrollBox(ref: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ width: 0, height: 0, top: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() =>
        setBox((b) =>
          b.width === el.clientWidth && b.height === el.clientHeight && b.top === el.scrollTop
            ? b
            : { width: el.clientWidth, height: el.clientHeight, top: el.scrollTop }
        )
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      el.removeEventListener('scroll', measure)
    }
  }, [ref])
  return box
}

/** Which rows of fixed height are within (or near) the viewport. */
export function visibleRange(
  count: number,
  rowHeight: number,
  top: number,
  height: number,
  offset = 0,
  overscan = 3
) {
  if (rowHeight <= 0 || count === 0) return { start: 0, end: 0 }
  const start = Math.max(0, Math.floor((top - offset) / rowHeight) - overscan)
  const end = Math.min(count, Math.ceil((top - offset + height) / rowHeight) + overscan)
  return { start, end: Math.max(start, end) }
}
