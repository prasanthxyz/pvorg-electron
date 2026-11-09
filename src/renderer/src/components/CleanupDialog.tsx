import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { CleanupPreview } from '../api/types'
import { bumpData, showError, showToast } from '../state/feedback'
import { refreshStatus } from '../state/status'
import { createStore, useStore } from '../state/store'
import { counted } from '../app/format'
import { Button } from './controls'
import { Dialog } from './Dialog'
import { Callout } from './feedback'
import { Icon } from './Icon'

export const cleanupOpen = createStore(false)

export function openCleanup(): void {
  cleanupOpen.set(true)
}

/** Clean Up Stale Entries: preview first; risky cases can't be confirmed by default (SPEC §3.5). */
export function CleanupDialog() {
  const open = useStore(cleanupOpen)
  const [preview, setPreview] = useState<CleanupPreview | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setPreview(null)
      return
    }
    let cancelled = false
    api
      .cleanupPreview()
      .then((p) => !cancelled && setPreview(p))
      .catch((error) => {
        cleanupOpen.set(false)
        showError('Cleanup Unavailable', error)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const close = () => cleanupOpen.set(false)

  const remove = async () => {
    if (!preview) return
    setBusy(true)
    try {
      const { removed } = await api.removeStale(preview.staleEntries)
      close()
      showToast(`Removed ${counted(removed, 'stale entry', 'stale entries')}`)
      bumpData()
      void refreshStatus()
    } catch (error) {
      close()
      showError('Cleanup Failed', error)
    } finally {
      setBusy(false)
    }
  }

  const nothing = preview?.staleEntries.length === 0

  return (
    <Dialog
      open={open && preview !== null}
      onClose={close}
      labelledBy="cleanup-title"
      describedBy="cleanup-text"
      className="dialog--wide"
    >
      {preview && (
        <>
          <div className="dialog__body dialog__body--left">
            <div className="cleanup__header">
              <span className={`dialog__icon${nothing ? ' dialog__icon--success' : ''}`}>
                <Icon name={nothing ? 'checkCircle' : 'cleanup'} size={22} />
              </span>
              <div>
                <h2 id="cleanup-title" className="dialog__title">
                  {nothing ? 'No Stale Entries' : 'Clean Up Stale Entries'}
                </h2>
                <p id="cleanup-text" className="dialog__message">
                  {nothing
                    ? 'Every entry in pvorg.json matches a video in your videos folder.'
                    : 'These pvorg.json entries refer to videos that are no longer in your videos folder. Removing them doesn’t touch any files.'}
                </p>
              </div>
            </div>

            <dl className="summary-grid">
              <dt>Videos folder</dt>
              <dd className="truncate" title={preview.videosPath}>
                {preview.videosPath}
              </dd>
              <dt>Videos on disk</dt>
              <dd className="tabular">{preview.videoFileCount.toLocaleString()}</dd>
              <dt>Entries in pvorg.json</dt>
              <dd className="tabular">{preview.relationCount.toLocaleString()}</dd>
              <dt>Stale entries</dt>
              <dd className="tabular">{preview.staleEntries.length.toLocaleString()}</dd>
            </dl>

            {preview.highRisk && (
              <Callout tone="critical" title="No videos are visible in the videos folder">
                If a drive is disconnected or the folder is temporarily unavailable, removing these
                entries permanently deletes your mapping decisions.
              </Callout>
            )}

            {!nothing && (
              <section aria-labelledby="cleanup-list-title">
                <h3 id="cleanup-list-title" className="cleanup__list-title">
                  Entries to Remove
                </h3>
                <ul className="cleanup__list">
                  {preview.staleEntries.map((entry) => (
                    <li key={entry} className="truncate" title={entry}>
                      {entry}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <div className="dialog__actions">
            {nothing ? (
              <Button variant="primary" data-autofocus onClick={close}>
                Done
              </Button>
            ) : (
              <>
                <Button data-autofocus={preview.highRisk || undefined} onClick={close}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  data-autofocus={!preview.highRisk || undefined}
                  onClick={remove}
                >
                  Remove {counted(preview.staleEntries.length, 'Entry', 'Entries')}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </Dialog>
  )
}
