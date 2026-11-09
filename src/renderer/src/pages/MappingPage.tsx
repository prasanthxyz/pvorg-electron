import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import type { MappingKind, MappingRow, MappingState, TriState } from '../api/types'
import { counted, humanize, matches } from '../app/format'
import { usePageCommands } from '../app/shortcuts'
import { useScrollBox, visibleRange } from '../app/virtual'
import { Button, IconButton, SearchField, Segmented } from '../components/controls'
import { ConfirmDialog, Dialog } from '../components/Dialog'
import { EmptyState, PageHeader } from '../components/feedback'
import { Icon, type IconName } from '../components/Icon'
import { openMenuAt, openMenuFrom, type MenuEntry } from '../components/Menu'
import { hoverPreviewHandlers } from '../components/Preview'
import { Thumbnail } from '../components/Thumbnail'
import { bumpData, dataVersion, showError, showToast } from '../state/feedback'
import {
  changeCount,
  mappingSessions,
  prune,
  setCell,
  updateSession,
  type Pending
} from '../state/mapping'
import { commandKey, revealLabel } from '../state/status'
import { useStore } from '../state/store'

const ROW_HEIGHT = 52
const HEADER_HEIGHT = 44
const CODES: Record<string, TriState> = { y: 'yes', n: 'no', u: 'undecided' }
const NEXT: Record<TriState, TriState> = { undecided: 'yes', yes: 'no', no: 'undecided' }
const GLYPH: Record<TriState, IconName> = { yes: 'check', no: 'x', undecided: 'minus' }
const TITLE: Record<TriState, string> = { yes: 'Yes', no: 'No', undecided: 'Undecided' }
const NOUN: Record<MappingKind, string> = { galleries: 'gallery', tags: 'tag' }

const saved = (row: MappingRow, column: number): TriState =>
  CODES[row.states[column]] ?? 'undecided'

export default function MappingPage({ kind }: { kind: MappingKind }) {
  const version = useStore(dataVersion)
  const session = useStore(mappingSessions[kind])
  const [data, setData] = useState<MappingState | null>(null)
  const [confirmRevert, setConfirmRevert] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addingTag, setAddingTag] = useState(false)
  const [removing, setRemoving] = useState<{ tag: string; count: number } | null>(null)
  const search = useRef<HTMLInputElement>(null)
  const title = kind === 'galleries' ? 'Gallery Mapping' : 'Tag Mapping'

  useEffect(() => {
    document.title = `${title} – P Video Organizer`
    let cancelled = false
    api
      .mapping(kind)
      .then((d) => {
        if (cancelled) return
        setData(d)
        prune(kind, new Set(d.rows.map((r) => r.filename)), new Set(d.columns))
      })
      .catch((e) => showError(`Couldn’t Load ${title}`, e))
    return () => {
      cancelled = true
    }
  }, [kind, version, title])

  const pendingCount = changeCount(session.pending)
  const undecidedRows = useMemo(
    () => data?.rows.filter((r) => r.states.includes('u')) ?? [],
    [data]
  )
  const rows = useMemo(() => {
    const scoped = session.showAll ? (data?.rows ?? []) : undecidedRows
    return scoped.filter((r) =>
      matches(session.query, [r.title, r.filename, humanize(r.studio), ...r.actors.map(humanize)])
    )
  }, [data, undecidedRows, session.showAll, session.query])

  const save = async () => {
    if (!pendingCount || saving) return
    setSaving(true)
    try {
      const result = await api.saveMapping(kind, session.pending)
      updateSession(kind, { pending: {} })
      showToast(`Saved ${counted(result.saved, 'change')}`)
      bumpData()
    } catch (error) {
      showError('Couldn’t Save Changes', error)
    } finally {
      setSaving(false)
    }
  }

  const requestRemoveTag = async (tag: string) => {
    try {
      const { count } = await api.tagDecisionCount(tag)
      setRemoving({ tag, count })
    } catch (error) {
      showError('Couldn’t Remove the Tag', error)
    }
  }

  const removeTag = async () => {
    if (!removing) return
    const { tag } = removing
    setRemoving(null)
    try {
      await api.removeTag(tag)
      // Pending edits for the tag go with it.
      mappingSessions.tags.set((s) => {
        const pending: Pending = {}
        for (const [filename, cells] of Object.entries(s.pending)) {
          const { [tag]: _, ...rest } = cells
          if (Object.keys(rest).length) pending[filename] = rest
        }
        return { ...s, pending }
      })
      showToast(`Removed the tag “${tag}”`, 'trash')
      bumpData()
    } catch (error) {
      showError('Couldn’t Remove the Tag', error)
    }
  }

  usePageCommands((command) => {
    switch (command.type) {
      case 'save':
        void save()
        return true
      case 'revert':
        if (pendingCount) setConfirmRevert(true)
        return true
      case 'find':
        search.current?.focus()
        search.current?.select()
        return true
      case 'addTag':
        if (kind !== 'tags') return false
        setAddingTag(true)
        return true
      default:
        return false
    }
  })

  const subtitle = !data
    ? ''
    : pendingCount
      ? counted(pendingCount, 'unsaved change')
      : undecidedRows.length === 0
        ? 'All videos decided'
        : `${counted(undecidedRows.length, 'video')} need decisions`

  return (
    <div className="mapping">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <Segmented
              label="Show"
              value={session.showAll ? 'all' : 'undecided'}
              onChange={(v) => updateSession(kind, { showAll: v === 'all' })}
              options={[
                {
                  value: 'undecided',
                  label: 'Undecided',
                  title: 'Only videos that still need a decision'
                },
                { value: 'all', label: 'All', title: 'Every video' }
              ]}
            />
            {kind === 'tags' && (
              <Button
                icon="plus"
                onClick={() => setAddingTag(true)}
                title="Add tags to the vocabulary"
              >
                Add Tag
              </Button>
            )}
            <SearchField
              ref={search}
              value={session.query}
              onChange={(q) => updateSession(kind, { query: q })}
              placeholder="Search Videos"
              label="Search videos"
            />
            <Button
              icon="undo"
              disabled={!pendingCount}
              onClick={() => setConfirmRevert(true)}
              title="Discard unsaved changes"
            >
              Revert
            </Button>
            <Button
              variant="primary"
              disabled={!pendingCount || saving}
              onClick={() => void save()}
              title={`Save changes to pvorg.json (${commandKey()}S)`}
            >
              Save
            </Button>
          </>
        }
      />
      {data && (
        <MappingBody
          kind={kind}
          data={data}
          rows={rows}
          pending={session.pending}
          onAddTag={() => setAddingTag(true)}
          onRemoveTag={(tag) => void requestRemoveTag(tag)}
        />
      )}
      {data && data.columns.length > 0 && data.rows.length > 0 && (
        <footer className="status-bar">
          <span className="status-bar__legend">
            {(['undecided', 'yes', 'no'] as TriState[]).map((state) => (
              <span key={state} className="legend-item">
                <span className={`tri tri--${state} tri--small`} aria-hidden="true">
                  <Icon name={GLYPH[state]} size={12} />
                </span>
                {TITLE[state]}
              </span>
            ))}
            <span className="status-bar__hint">Click a cell to cycle</span>
          </span>
          <span className="status-bar__counts tabular">
            {pendingCount > 0 && (
              <span className="status-bar__pending">
                <span className="dot" aria-hidden="true" />
                {counted(pendingCount, 'unsaved change')}
              </span>
            )}
            <span>
              {rows.length.toLocaleString()} of {counted(data.rows.length, 'video')} shown
            </span>
          </span>
        </footer>
      )}
      <ConfirmDialog
        open={confirmRevert}
        title={`Discard ${counted(pendingCount, 'Unsaved Change')}?`}
        message="Cells go back to their saved decisions."
        confirmLabel="Discard Changes"
        destructive
        icon="undo"
        onCancel={() => setConfirmRevert(false)}
        onConfirm={() => {
          updateSession(kind, { pending: {} })
          setConfirmRevert(false)
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove the Tag “${removing?.tag ?? ''}”?`}
        message={
          removing?.count
            ? `${counted(removing.count, 'video has a decision', 'videos have a decision')} for this tag. Removing it deletes those decisions from pvorg.json and drops it from the required tags in Filters.`
            : 'No video has a decision for this tag yet. It is removed from pvorg.json and from the required tags in Filters.'
        }
        confirmLabel="Remove Tag"
        destructive
        icon="trash"
        onCancel={() => setRemoving(null)}
        onConfirm={() => void removeTag()}
      />
      {kind === 'tags' && <AddTagDialog open={addingTag} onClose={() => setAddingTag(false)} />}
    </div>
  )
}

/** Add Tag: comma-separated names; names matching an existing tag ignoring case are skipped (SPEC §3.9). */
function AddTagDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setValue('')
  }, [open])
  const names = value
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)

  const submit = async () => {
    if (!names.length || busy) return
    setBusy(true)
    try {
      const { added, skipped } = await api.addTags(value)
      onClose()
      if (added.length) {
        showToast(
          `Added ${added.length === 1 ? `the tag “${added[0]}”` : counted(added.length, 'tag')}` +
            (skipped.length ? ` · ${counted(skipped.length, 'name')} already existed` : '')
        )
        bumpData()
      } else {
        showToast(
          skipped.length === 1 ? `“${skipped[0]}” already exists` : 'Those tags already exist'
        )
      }
    } catch (error) {
      onClose()
      showError('Couldn’t Add Tags', error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="add-tag-title" describedBy="add-tag-text">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="dialog__body dialog__body--left">
          <h2 id="add-tag-title" className="dialog__title">
            Add Tag
          </h2>
          <p id="add-tag-text" className="dialog__message">
            Separate several tags with commas. Tags that already exist are skipped.
          </p>
          <label className="field">
            <span className="field__label">Tag names</span>
            <input
              className="field__input"
              type="text"
              value={value}
              placeholder="outdoor, night, 4k"
              autoComplete="off"
              spellCheck={false}
              data-autofocus
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        </div>
        <div className="dialog__actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!names.length || busy}>
            {names.length > 1 ? `Add ${names.length} Tags` : 'Add Tag'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function MappingBody({
  kind,
  data,
  rows,
  pending,
  onAddTag,
  onRemoveTag
}: {
  kind: MappingKind
  data: MappingState
  rows: MappingRow[]
  pending: Pending
  onAddTag: () => void
  onRemoveTag: (tag: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const box = useScrollBox(scroller)
  const session = useStore(mappingSessions[kind])

  if (data.columns.length === 0) {
    return (
      <div className="page-scroll">
        {kind === 'galleries' ? (
          <EmptyState icon="photos" title="No Galleries">
            Add folders of images to <code>{data.galleriesPath}</code>, then reload the library.
          </EmptyState>
        ) : (
          <EmptyState
            icon="tagMapping"
            title="No Tags"
            actions={
              <Button variant="primary" icon="plus" onClick={onAddTag}>
                Add Tag
              </Button>
            }
          >
            Tags you add are saved to the “tags” list in pvorg.json.
          </EmptyState>
        )}
      </div>
    )
  }
  if (data.rows.length === 0) {
    return (
      <div className="page-scroll">
        <EmptyState icon="film" title="No Videos">
          There’s nothing to map yet.
        </EmptyState>
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="page-scroll">
        {session.query.trim() ? (
          <EmptyState icon="search" title={`No Results for “${session.query.trim()}”`}>
            Check the spelling or try a new search.
          </EmptyState>
        ) : (
          <EmptyState
            icon="checkCircle"
            title="All Caught Up"
            actions={
              <Button onClick={() => updateSession(kind, { showAll: true })}>
                Show All Videos
              </Button>
            }
          >
            Every video has a decision for every {NOUN[kind]}.
          </EmptyState>
        )}
      </div>
    )
  }

  const { start, end } = visibleRange(
    rows.length,
    ROW_HEIGHT,
    box.top,
    box.height,
    HEADER_HEIGHT,
    6
  )
  const columnIndex = new Map(data.columns.map((c, i) => [c, i]))
  const stateOf = (row: MappingRow, column: string): TriState =>
    pending[row.filename]?.[column] ?? saved(row, columnIndex.get(column)!)

  const setColumn = (column: string, state: TriState) => {
    const index = columnIndex.get(column)!
    for (const row of rows) setCell(kind, row.filename, column, state, saved(row, index))
  }
  const setRow = (row: MappingRow, state: TriState) =>
    data.columns.forEach((column, i) => setCell(kind, row.filename, column, state, saved(row, i)))

  const bulkEntries = (apply: (state: TriState) => void, heading: string): MenuEntry[] => [
    { heading },
    ...(['yes', 'no', 'undecided'] as TriState[]).map((state) => ({
      label: TITLE[state],
      icon: GLYPH[state],
      onSelect: () => apply(state)
    }))
  ]

  const rowMenu = (row: MappingRow): MenuEntry[] => [
    ...bulkEntries((s) => setRow(row, s), 'Set every column to'),
    { separator: true },
    {
      label: revealLabel(),
      icon: 'folder',
      onSelect: () => void api.reveal({ kind: 'video', filename: row.filename })
    },
    {
      label: 'Open in Default App',
      icon: 'external',
      onSelect: () =>
        void api
          .openInDefaultApp(row.filename)
          .catch((error) => showError('Couldn’t Open the Video', error))
    }
  ]

  const columnMenu = (column: string): MenuEntry[] => [
    ...bulkEntries((s) => setColumn(column, s), 'Set all shown videos to'),
    ...(kind === 'tags'
      ? ([
          { separator: true },
          {
            label: 'Remove Tag…',
            icon: 'trash',
            destructive: true,
            onSelect: () => onRemoveTag(column)
          }
        ] as MenuEntry[])
      : ([
          { separator: true },
          {
            label: revealLabel(),
            icon: 'folder',
            onSelect: () => void api.reveal({ kind: 'gallery', name: column })
          }
        ] as MenuEntry[]))
  ]

  return (
    <div ref={scroller} className="page-scroll mapping__scroll">
      <table
        className="matrix"
        aria-label={kind === 'galleries' ? 'Gallery decisions' : 'Tag decisions'}
        aria-rowcount={rows.length + 1}
      >
        <thead>
          <tr>
            <th scope="col" className="matrix__corner">
              Video
            </th>
            {data.columns.map((column) => (
              <th key={column} scope="col" className="matrix__column">
                <button
                  type="button"
                  className="matrix__column-button"
                  title={`${column} – set every shown video at once`}
                  aria-haspopup="menu"
                  onClick={(e) => openMenuFrom(e.currentTarget, column, columnMenu(column))}
                >
                  <span className="matrix__column-label">{column}</span>
                  <Icon name="chevronDown" size={12} />
                </button>
              </th>
            ))}
            <th className="matrix__filler" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {start > 0 && (
            <tr aria-hidden="true" style={{ height: start * ROW_HEIGHT }}>
              <td colSpan={data.columns.length + 2} />
            </tr>
          )}
          {rows.slice(start, end).map((row, i) => (
            <tr
              key={row.filename}
              className={(start + i) % 2 ? 'is-odd' : undefined}
              aria-rowindex={start + i + 2}
              onContextMenu={(e) => openMenuAt(e, row.title, rowMenu(row))}
            >
              <th scope="row" className="matrix__video">
                <span className="matrix__video-inner">
                  <span
                    className="matrix__thumb on-stage"
                    {...hoverPreviewHandlers(row.previewUrl)}
                  >
                    <Thumbnail src={row.thumbUrl} />
                  </span>
                  <span className="matrix__video-text" title={row.filename}>
                    <span className="matrix__title truncate">{row.title}</span>
                    <span className="matrix__credits truncate">{row.credits}</span>
                  </span>
                  <IconButton
                    icon="more"
                    label={`Actions for ${row.title}`}
                    className="matrix__row-menu"
                    onClick={(e) => openMenuFrom(e.currentTarget, row.title, rowMenu(row))}
                  />
                </span>
              </th>
              {data.columns.map((column, c) => {
                const state = stateOf(row, column)
                const modified = pending[row.filename]?.[column] !== undefined
                return (
                  <td key={column} className="matrix__cell">
                    <button
                      type="button"
                      className="matrix__cell-button"
                      aria-label={`${row.title}, ${column}`}
                      aria-description={modified ? `${TITLE[state]}, unsaved` : TITLE[state]}
                      title={`${TITLE[state]}${modified ? ' (unsaved)' : ''} – click to change`}
                      onClick={() =>
                        setCell(kind, row.filename, column, NEXT[state], saved(row, c))
                      }
                    >
                      <span className={`tri tri--${state}${modified ? ' is-modified' : ''}`}>
                        <Icon name={GLYPH[state]} size={13} />
                      </span>
                      <span className="visually-hidden">
                        {modified ? `${TITLE[state]}, unsaved` : TITLE[state]}
                      </span>
                    </button>
                  </td>
                )
              })}
              <td className="matrix__filler" aria-hidden="true" />
            </tr>
          ))}
          {end < rows.length && (
            <tr aria-hidden="true" style={{ height: (rows.length - end) * ROW_HEIGHT }}>
              <td colSpan={data.columns.length + 2} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
