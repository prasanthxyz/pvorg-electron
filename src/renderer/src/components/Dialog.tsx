import { useEffect, useRef, type ReactNode } from 'react'
import { alert, dismissToast } from '../state/feedback'
import { useStore } from '../state/store'
import { Button } from './controls'
import { Icon, type IconName } from './Icon'

interface DialogProps {
  open: boolean
  onClose: () => void
  labelledBy: string
  describedBy?: string
  className?: string
  children: ReactNode
}

/** A native modal <dialog>: focus is trapped, Esc closes, and focus returns to the opener. */
export function Dialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  className,
  children
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<Element | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      opener.current = document.activeElement
      dismissToast()
      dialog.showModal()
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
      ;(opener.current as HTMLElement | null)?.focus?.()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className={['dialog', className].filter(Boolean).join(' ')}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      {open && children}
    </dialog>
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  destructive?: boolean
  /** Which button Enter activates. Destructive confirmations default to Cancel. */
  defaultAction?: 'confirm' | 'cancel'
  icon?: IconName
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  destructive,
  defaultAction = destructive ? 'cancel' : 'confirm',
  icon,
  busy,
  onConfirm,
  onCancel
}: ConfirmProps) {
  return (
    <Dialog open={open} onClose={onCancel} labelledBy="confirm-title" describedBy="confirm-message">
      <div className="dialog__body">
        {icon && (
          <span className={`dialog__icon${destructive ? ' dialog__icon--danger' : ''}`}>
            <Icon name={icon} size={22} />
          </span>
        )}
        <h2 id="confirm-title" className="dialog__title">
          {title}
        </h2>
        <div id="confirm-message" className="dialog__message">
          {message}
        </div>
      </div>
      <div className="dialog__actions">
        <Button data-autofocus={defaultAction === 'cancel' || undefined} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          data-autofocus={defaultAction === 'confirm' || undefined}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}

/** Errors that need acknowledgement (SPEC §7.2). */
export function AlertHost() {
  const current = useStore(alert)
  return (
    <Dialog
      open={current !== null}
      onClose={() => alert.set(null)}
      labelledBy="alert-title"
      describedBy="alert-message"
    >
      {current && (
        <>
          <div className="dialog__body">
            <span className="dialog__icon dialog__icon--warning">
              <Icon name="warning" size={22} />
            </span>
            <h2 id="alert-title" className="dialog__title">
              {current.title}
            </h2>
            <p id="alert-message" className="dialog__message dialog__message--pre">
              {current.message}
            </p>
          </div>
          <div className="dialog__actions">
            <Button variant="primary" data-autofocus onClick={() => alert.set(null)}>
              OK
            </Button>
          </div>
        </>
      )}
    </Dialog>
  )
}
