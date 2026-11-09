import { useState } from 'react'
import { Icon } from './Icon'

interface ThumbnailProps {
  src: string | null
  alt?: string
  fit?: 'cover' | 'contain'
  className?: string
  /** Load eagerly (above-the-fold, or the viewer's main image). */
  eager?: boolean
}

/**
 * An image that decodes off the main thread (`decoding="async"`), loads lazily,
 * fades in once ready and shows a quiet placeholder or a photo glyph if missing.
 */
export function Thumbnail({ src, alt = '', fit = 'cover', className, eager }: ThumbnailProps) {
  // State is tied to the src it describes, so a cached image that loads before
  // effects run can't be reset to "loading" afterwards.
  const [status, setStatus] = useState<{ src: string | null; state: 'loaded' | 'failed' } | null>(
    null
  )
  const state = !src ? 'failed' : status?.src === src ? status.state : 'loading'

  return (
    <span
      className={['thumb', `thumb--${fit}`, `is-${state}`, className].filter(Boolean).join(' ')}
    >
      {src && state !== 'failed' && (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setStatus({ src, state: 'loaded' })}
          onError={() => setStatus({ src, state: 'failed' })}
        />
      )}
      {state === 'failed' && <Icon name="photo" size={22} className="thumb__missing" />}
    </span>
  )
}
