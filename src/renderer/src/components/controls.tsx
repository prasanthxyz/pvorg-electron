import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: IconName
  size?: 'sm' | 'md'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', icon, size = 'md', className, children, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children && <span className="btn__label">{children}</span>}
    </button>
  )
})

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  /** Shortcut shown in the tooltip, e.g. "N". */
  shortcut?: string
  variant?: 'ghost' | 'secondary'
}

/** Icon-only button: the label is its accessible name and tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, shortcut, variant = 'ghost', className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={['icon-btn', `icon-btn--${variant}`, className].filter(Boolean).join(' ')}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  )
})

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string; icon?: IconName; iconOnly?: boolean; title?: string }[]
  onChange: (value: T) => void
  disabled?: boolean
}

/** A radio group drawn as a segmented control. Arrow keys move between options. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled
}: SegmentedProps<T>) {
  const name = useId()
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label
          key={option.value}
          className={`segmented__option${option.value === value ? ' is-selected' : ''}`}
          title={option.title}
        >
          <input
            type="radio"
            className="visually-hidden"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
          />
          {option.icon && <Icon name={option.icon} size={16} />}
          <span className={option.iconOnly ? 'visually-hidden' : undefined}>{option.label}</span>
        </label>
      ))}
    </div>
  )
}

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, placeholder, label },
  ref
) {
  return (
    <div className="search">
      <Icon name="search" size={16} className="search__icon" />
      <input
        ref={ref}
        type="search"
        className="search__input"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Esc leaves the field and keeps the query (SPEC §7.1, Desktop); shortcuts work again.
          if (e.key === 'Escape') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />
    </div>
  )
})

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

/** Paths truncate in the middle so the file name stays visible (SPEC §8.4). */
export function MiddleTruncate({ text }: { text: string }) {
  const cut = Math.max(0, text.length - Math.min(28, Math.floor(text.length / 2)))
  return (
    <span className="middle-truncate" title={text}>
      <span className="middle-truncate__start">{text.slice(0, cut)}</span>
      <span className="middle-truncate__end">{text.slice(cut)}</span>
    </span>
  )
}
