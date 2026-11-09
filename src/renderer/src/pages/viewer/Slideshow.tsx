import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'

const INTERVAL = 2000

function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function preload(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = img.onerror = () => resolve()
    img.src = src
  })
}

/**
 * The gallery in random order, advancing every 2 s with a 0.3 s crossfade (SPEC §5).
 * The next image is decoded before switching, so the fade never shows a blank frame.
 */
export function Slideshow({ name, images }: { name: string; images: string[] }) {
  const order = useMemo(() => shuffled(images), [name, images.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
    if (order.length < 2) return
    let cancelled = false
    let current = 0
    let timer: number
    const tick = async () => {
      const next = (current + 1) % order.length
      await Promise.all([
        preload(order[next]),
        new Promise((r) => (timer = window.setTimeout(r, INTERVAL)))
      ])
      if (cancelled) return
      current = next
      setIndex(next)
      void tick()
    }
    void preload(order[0]).then(() => {
      if (!cancelled) void tick()
    })
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [order])

  return (
    <section className="slideshow" aria-label={`Gallery ${name}`}>
      {order.length === 0 ? (
        <div className="slideshow__empty">
          <Icon name="photos" size={32} />
          <p className="slideshow__empty-title">No Images</p>
          <p>This gallery folder is empty.</p>
        </div>
      ) : (
        order.map((src, i) => (
          <img
            key={src}
            src={
              Math.abs(i - index) <= 1 ||
              i === (index + 1) % order.length ||
              i === (index - 1 + order.length) % order.length
                ? src
                : undefined
            }
            alt={i === index ? `Image ${index + 1} of ${order.length} from ${name}` : ''}
            className={`slideshow__image${i === index ? ' is-visible' : ''}`}
            decoding="async"
            aria-hidden={i !== index}
          />
        ))
      )}
      <div className="slideshow__caption">
        <span className="slideshow__name truncate">{name}</span>
        {order.length > 0 && (
          <span className="slideshow__count tabular">
            {index + 1} of {order.length}
          </span>
        )}
      </div>
    </section>
  )
}
