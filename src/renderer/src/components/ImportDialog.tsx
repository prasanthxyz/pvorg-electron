import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ImportPreview } from '../api/types'
import { counted } from '../app/format'
import { bumpData, showError, showToast } from '../state/feedback'
import { refreshStatus } from '../state/status'
import { createStore, useStore } from '../state/store'
import { Button, MiddleTruncate } from './controls'
import { Dialog } from './Dialog'
import { Callout } from './feedback'
import { Icon } from './Icon'

const importStore = createStore<ImportPreview | null>(null)

/** File › Import from pvorg.yml…: choose the file, review the preview, confirm (SPEC §3.10). */
export async function openImport(): Promise<void> {
  try {
    const { file } = await api.chooseImportFile()
    if (!file) return
    importStore.set(await api.importPreview(file))
  } catch (error) {
    showError('Couldn’t Read pvorg.yml', error)
  }
}

function List({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="import__section">
      <h3 className="import__list-title">
        {title} <span className="import__count tabular">{items.length.toLocaleString()}</span>
      </h3>
      {items.length ? (
        <ul className="import__list">
          {items.map((item) => (
            <li key={item}>
              <MiddleTruncate text={item} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="import__empty">{empty}</p>
      )}
    </section>
  )
}

export function ImportDialog() {
  const preview = useStore(importStore)
  const [busy, setBusy] = useState(false)
  useEffect(() => setBusy(false), [preview])

  const close = () => importStore.set(null)

  const apply = async () => {
    if (!preview) return
    setBusy(true)
    try {
      const result = await api.importApply(preview.file)
      close()
      showToast(
        result.decisionCount || result.tagsToAdd.length
          ? `Imported ${counted(result.decisionCount, 'decision')}` +
              (result.tagsToAdd.length ? ` and ${counted(result.tagsToAdd.length, 'tag')}` : '')
          : 'Nothing new to import'
      )
      bumpData()
      void refreshStatus()
    } catch (error) {
      close()
      showError('Import Failed', error)
    }
  }

  const nothing = preview !== null && preview.decisionCount === 0 && preview.tagsToAdd.length === 0

  return (
    <Dialog
      open={preview !== null}
      onClose={close}
      labelledBy="import-title"
      describedBy="import-text"
      className="dialog--wide"
    >
      {preview && (
        <>
          <div className="dialog__body dialog__body--left">
            <div className="cleanup__header">
              <span className={`dialog__icon${nothing ? ' dialog__icon--success' : ''}`}>
                <Icon name={nothing ? 'checkCircle' : 'import'} size={22} />
              </span>
              <div>
                <h2 id="import-title" className="dialog__title">
                  {nothing ? 'Nothing New to Import' : 'Import from pvorg.yml'}
                </h2>
                <p id="import-text" className="dialog__message">
                  {nothing
                    ? 'Every pairing and tag in this file is already decided in pvorg.json.'
                    : 'Pairings and tags from the old library fill in undecided cells. Decisions already in pvorg.json are kept, and no files are moved or deleted.'}
                </p>
              </div>
            </div>

            <dl className="summary-grid">
              <dt>File</dt>
              <dd>
                <MiddleTruncate text={preview.file} />
              </dd>
              <dt>Videos matched</dt>
              <dd className="tabular">
                {preview.matchedVideos.length.toLocaleString()} of{' '}
                {(preview.matchedVideos.length + preview.unmatchedVideos.length).toLocaleString()}
              </dd>
              <dt>Galleries matched</dt>
              <dd className="tabular">
                {preview.matchedGalleries.length.toLocaleString()} of{' '}
                {(
                  preview.matchedGalleries.length + preview.unmatchedGalleries.length
                ).toLocaleString()}
              </dd>
              <dt>Decisions to write</dt>
              <dd className="tabular">{preview.decisionCount.toLocaleString()}</dd>
              <dt>Tags to add</dt>
              <dd className="truncate" title={preview.tagsToAdd.join(', ')}>
                {preview.tagsToAdd.length ? preview.tagsToAdd.join(', ') : 'None'}
              </dd>
            </dl>

            {preview.keptCount > 0 && (
              <p className="import__note">
                {counted(preview.keptCount, 'cell')} already decided in pvorg.json{' '}
                {preview.keptCount === 1 ? 'stays' : 'stay'} as{' '}
                {preview.keptCount === 1 ? 'it is' : 'they are'}.
              </p>
            )}

            {preview.unmatchedVideos.length > 0 && (
              <Callout
                tone="warning"
                title={`${counted(preview.unmatchedVideos.length, 'video')} not found`}
              >
                Their decisions aren’t imported. Videos match by filename inside the videos folder.
              </Callout>
            )}

            <div className="import__lists">
              <List
                title="Videos Matched"
                items={preview.matchedVideos.map((v) => v.filename)}
                empty="No videos in this file are in your library."
              />
              <List
                title="Not Found"
                items={preview.unmatchedVideos.map((v) => `${v.path} — ${v.reason}`)}
                empty="Every video was found."
              />
              <List
                title="Galleries Matched"
                items={preview.matchedGalleries}
                empty="No galleries match by folder name."
              />
              {preview.unmatchedGalleries.length > 0 && (
                <List title="Galleries Not Found" items={preview.unmatchedGalleries} empty="" />
              )}
            </div>
          </div>
          <div className="dialog__actions">
            {nothing ? (
              <Button variant="primary" data-autofocus onClick={close}>
                Done
              </Button>
            ) : (
              <>
                <Button onClick={close}>Cancel</Button>
                <Button variant="primary" data-autofocus disabled={busy} onClick={apply}>
                  {preview.decisionCount
                    ? `Import ${counted(preview.decisionCount, 'Decision')}`
                    : `Add ${counted(preview.tagsToAdd.length, 'Tag')}`}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </Dialog>
  )
}
