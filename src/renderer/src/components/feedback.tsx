import type { ReactNode } from 'react'
import { dismissToast, toast } from '../state/feedback'
import { useStore } from '../state/store'
import { Icon, type IconName } from './Icon'

export function EmptyState({
  icon,
  title,
  children,
  actions,
  tone
}: {
  icon: IconName
  title: string
  children?: ReactNode
  actions?: ReactNode
  tone?: 'warning'
}) {
  return (
    <div className="empty" role="status">
      <span className={`empty__icon${tone ? ` empty__icon--${tone}` : ''}`}>
        <Icon name={icon} size={40} />
      </span>
      <h2 className="empty__title">{title}</h2>
      {children && <div className="empty__text">{children}</div>}
      {actions && <div className="empty__actions">{actions}</div>}
    </div>
  )
}

export function Callout({
  tone,
  title,
  children,
  action
}: {
  tone: 'warning' | 'critical'
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={`callout callout--${tone}`} role={tone === 'critical' ? 'alert' : 'note'}>
      <Icon name="warning" size={18} className="callout__icon" />
      <div className="callout__body">
        <p className="callout__title">{title}</p>
        <p className="callout__text">{children}</p>
      </div>
      {action && <div className="callout__action">{action}</div>}
    </div>
  )
}

export function ProgressBar({ value, label }: { value: number | null; label: string }) {
  return (
    <div
      className={`progress${value === null ? ' progress--indeterminate' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={value === null ? undefined : 0}
      aria-valuemax={value === null ? undefined : 100}
      aria-valuenow={value === null ? undefined : Math.round(value * 100)}
    >
      <div
        className="progress__bar"
        style={value === null ? undefined : { width: `${Math.max(2, value * 100)}%` }}
      />
    </div>
  )
}

const TOAST_ICONS: Record<string, IconName> = {
  check: 'checkCircle',
  trash: 'trash',
  thumbsDown: 'thumbsDownFill'
}

/** Always mounted, so screen readers announce each new message (polite live region). */
export function ToastRegion() {
  const current = useStore(toast)
  return (
    <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
      {current && (
        <div key={current.id} className="toast">
          <Icon name={TOAST_ICONS[current.icon]} size={18} className="toast__icon" />
          <span className="toast__message">{current.message}</span>
          {current.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                current.action?.run()
                dismissToast()
              }}
            >
              {current.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
  titleId = 'page-title'
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  titleId?: string
}) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1 id={titleId} className="page-header__title truncate" title={title}>
          {title}
        </h1>
        {subtitle !== undefined && (
          <p className="page-header__subtitle truncate tabular">{subtitle || ' '}</p>
        )}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}
