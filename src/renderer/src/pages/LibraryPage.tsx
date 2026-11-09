import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import type { LibraryState, VideoSummary } from '../api/types'
import { counted, detailParts, humanize, joinNames, matches } from '../app/format'
import { setMenuBits, usePageCommands } from '../app/shortcuts'
import { useScrollBox, visibleRange } from '../app/virtual'
import { Button, SearchField } from '../components/controls'
import { ConfirmDialog, Dialog } from '../components/Dialog'
import { Callout, EmptyState, PageHeader } from '../components/feedback'
import { Icon } from '../components/Icon'
import { openMenuAt, openMenuFrom, type MenuEntry } from '../components/Menu'
import { MissingToolsCallout } from '../components/MissingTools'
import { hoverPreviewHandlers, openPreview } from '../components/Preview'
import { Thumbnail } from '../components/Thumbnail'
import { bumpData, dataVersion, showError, showToast, alert as alertStore } from '../state/feedback'
import {
  keepOnly,
  librarySearch,
  librarySelection,
  librarySort,
  regenerating,
  SORT_LABELS,
  sortVideos,
  toggleSelection,
  type SortKey
} from '../state/library'
import { commandKey, refreshStatus, reloadLibrary, revealLabel } from '../state/status'
import { useStore } from '../state/store'

const CARD_MIN = 220
const CARD_MAX = 320
const GAP_X = 16
const GAP_Y = 24
const PADDING = 24
const TEXT_HEIGHT = 52

function searchFields(v: VideoSummary): string[] {
  return [v.title, v.filename, humanize(v.studio), ...v.actors.map(humanize)]
}

/** The card tooltip: filename plus the video details (SPEC §6.8). */
function tooltip(video: VideoSummary): string {
  if (!video.details) return `${video.filename}\nNo video details yet`
  const d = detailParts(video.details)
  return [
    video.filename,
    `${d.duration} · ${d.resolution} · ${d.frameRate}`,
    `${d.size}${d.quality ? ` · Quality ${d.quality}` : ''}`
  ].join('\n')
}

async function regenerate(video: VideoSummary): Promise<void> {
  if (regenerating.get().has(video.filename)) return
  regenerating.set((s) => new Set(s).add(video.filename))
  try {
    const { ok } = await api.regenerateSheet(video.filename)
    if (ok) showToast(`Regenerated the contact sheet for “${video.title}”`)
    else
      showError(
        'Couldn’t Regenerate the Contact Sheet',
        new Error(`ffmpeg couldn’t read “${video.filename}”. The file may be damaged.`)
      )
    bumpData()
  } catch (error) {
    showError('Couldn’t Regenerate the Contact Sheet', error)
  } finally {
    regenerating.set((s) => {
      const next = new Set(s)
      next.delete(video.filename)
      return next
    })
  }
}

export default function LibraryPage() {
  const version = useStore(dataVersion)
  const query = useStore(librarySearch)
  const selection = useStore(librarySelection)
  const sort = useStore(librarySort)
  const [library, setLibrary] = useState<LibraryState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null)
  const [showSkipped, setShowSkipped] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = 'Library – P Video Organizer'
    let cancelled = false
    api
      .library()
      .then((l) => !cancelled && setLibrary(l))
      .catch((e) => showError('Couldn’t Load the Library', e))
    return () => {
      cancelled = true
    }
  }, [version])

  const visible = useMemo(
    () =>
      library
        ? sortVideos(
            library.videos.filter((v) => matches(query, searchFields(v))),
            sort
          )
        : [],
    [library, query, sort]
  )
  const visibleNames = useMemo(() => new Set(visible.map((v) => v.filename)), [visible])

  // What you see is what you delete: hidden videos leave the selection (SPEC §3.8).
  useEffect(() => {
    if (library) keepOnly(visibleNames)
  }, [library, visibleNames])

  useEffect(() => setMenuBits({ hasVideos: visible.length > 0 }), [visible.length])

  const allSelected = visible.length > 0 && visible.every((v) => selection.has(v.filename))
  const selectAll = () => librarySelection.set(new Set(visibleNames))
  const deselectAll = () => librarySelection.set(new Set())
  const requestDelete = (names: string[]) => names.length && setPendingDelete(names)

  usePageCommands((command) => {
    switch (command.type) {
      case 'selectAll':
        return visible.length > 0 && (selectAll(), true)
      case 'deselectAll':
        return selection.size > 0 && (deselectAll(), true)
      case 'deleteSelection':
        return selection.size > 0 && (requestDelete([...selection]), true)
      case 'find':
        search.current?.focus()
        search.current?.select()
        return true
      default:
        return false
    }
  })

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const result = await api.deleteVideos(pendingDelete)
      setPendingDelete(null)
      librarySelection.set(new Set())
      if (result.errors.length) {
        alertStore.set({
          title: 'Some Videos Couldn’t Be Deleted',
          message: `Deleted ${counted(result.deleted, 'video')}.\n\n${result.errors.join('\n')}`
        })
      } else {
        showToast(`Deleted ${counted(result.deleted, 'video')}`, 'trash')
      }
      bumpData()
      void refreshStatus()
    } catch (error) {
      setPendingDelete(null)
      showError('Delete Failed', error)
    } finally {
      setDeleting(false)
    }
  }

  const total = library?.videos.length ?? 0
  const subtitle = !library
    ? ''
    : selection.size
      ? `${selection.size.toLocaleString()} of ${counted(total, 'video')} selected`
      : query.trim()
        ? `${visible.length.toLocaleString()} of ${counted(total, 'video')}`
        : counted(total, 'video')

  const titles = new Map(library?.videos.map((v) => [v.filename, v.title]) ?? [])
  const deleteTitle = pendingDelete
    ? pendingDelete.length === 1
      ? `Delete “${titles.get(pendingDelete[0]) ?? pendingDelete[0]}”?`
      : `Delete ${counted(pendingDelete.length, 'Video')}?`
    : ''

  const sortMenu = (trigger: HTMLElement) => {
    const keys = Object.keys(SORT_LABELS) as SortKey[]
    const entries: MenuEntry[] = [
      { heading: 'Sort By' },
      ...keys.map((key) => ({
        label: SORT_LABELS[key],
        checked: sort.key === key,
        onSelect: () =>
          librarySort.set({
            key,
            ascending: key === 'title' ? true : sort.key === key ? sort.ascending : false
          })
      })),
      { separator: true },
      {
        label: sort.key === 'title' ? 'A to Z' : 'Ascending',
        checked: sort.ascending,
        onSelect: () => librarySort.set({ ...sort, ascending: true })
      },
      {
        label: sort.key === 'title' ? 'Z to A' : 'Descending',
        checked: !sort.ascending,
        onSelect: () => librarySort.set({ ...sort, ascending: false })
      }
    ]
    openMenuFrom(trigger, 'Sort videos', entries)
  }

  return (
    <div className="library">
      <PageHeader
        title="Library"
        subtitle={subtitle}
        actions={
          <>
            <SearchField
              ref={search}
              value={query}
              onChange={librarySearch.set}
              placeholder="Search Videos"
              label="Search videos"
            />
            <Button
              icon="sort"
              disabled={!library?.videos.length}
              aria-haspopup="menu"
              title={`Sort by ${SORT_LABELS[sort.key].toLowerCase()}, ${sort.ascending ? 'ascending' : 'descending'}`}
              onClick={(e) => sortMenu(e.currentTarget)}
            >
              {sort.key === 'title' && sort.ascending ? 'Sort' : SORT_LABELS[sort.key]}
            </Button>
            <Button
              icon="checkCircle"
              disabled={!visible.length || allSelected}
              onClick={selectAll}
              title={`Select every ${query.trim() ? 'matching ' : ''}video (${commandKey()}A)`}
            >
              Select All
            </Button>
            <Button
              icon="xCircle"
              disabled={!selection.size}
              onClick={deselectAll}
              title="Deselect all videos (Esc)"
            >
              Deselect All
            </Button>
            <Button
              variant="danger"
              icon="trash"
              disabled={!selection.size}
              onClick={() => requestDelete([...selection])}
              title={`Delete the selected videos (${commandKey() === '⌘' ? '⌘⌫' : 'Delete'})`}
            >
              Delete
            </Button>
          </>
        }
      />
      {library && (
        <LibraryBody
          library={library}
          visible={visible}
          query={query}
          selection={selection}
          onShowSkipped={() => setShowSkipped(true)}
          onDelete={requestDelete}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={deleteTitle}
        destructive
        icon="trash"
        busy={deleting}
        confirmLabel={deleteTitle.replace(/\?$/, '')}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        message={
          <>
            {pendingDelete && pendingDelete.length > 1 && pendingDelete.length <= 6 && (
              <p className="dialog__names">
                {joinNames(pendingDelete.map((f) => titles.get(f) ?? f))}.
              </p>
            )}
            <p>
              The video files, their contact sheets, mapping decisions and cached metadata will be
              permanently removed. This can’t be undone.
            </p>
          </>
        }
      />
      <Dialog
        open={showSkipped}
        onClose={() => setShowSkipped(false)}
        labelledBy="skipped-title"
        className="dialog--wide"
      >
        {library && (
          <>
            <div className="dialog__body dialog__body--left">
              <h2 id="skipped-title" className="dialog__title">
                Skipped Files
              </h2>
              <ul className="skipped-list">
                {library.skipped.map((file) => (
                  <li key={file.filename}>
                    <span className="skipped-list__name">{file.filename}</span>
                    <span className="skipped-list__reasons">{file.reasons.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="dialog__actions">
              <Button variant="primary" data-autofocus onClick={() => setShowSkipped(false)}>
                Done
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  )
}

function LibraryBody({
  library,
  visible,
  query,
  selection,
  onShowSkipped,
  onDelete
}: {
  library: LibraryState
  visible: VideoSummary[]
  query: string
  selection: ReadonlySet<string>
  onShowSkipped: () => void
  onDelete: (names: string[]) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const banner = useRef<HTMLDivElement>(null)
  const box = useScrollBox(scroller)
  const [bannerHeight, setBannerHeight] = useState(0)
  const busy = useStore(regenerating)
  const hasBanner = library.skipped.length > 0 || library.missingTools.length > 0

  useEffect(() => {
    const el = banner.current
    if (!el) return setBannerHeight(0)
    const observer = new ResizeObserver(() => setBannerHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasBanner, library.videos.length])

  const notices = hasBanner && (
    <div ref={banner} className="library__banner">
      {library.missingTools.length > 0 && <MissingToolsCallout tools={library.missingTools} />}
      {library.skipped.length > 0 && (
        <Callout
          tone="warning"
          title={`${counted(library.skipped.length, 'file')} skipped`}
          action={
            <Button size="sm" onClick={onShowSkipped}>
              Show Files
            </Button>
          }
        >
          Names must be lowercase, without spaces, in the form studio-cast-title.
        </Callout>
      )}
    </div>
  )

  if (!library.videos.length) {
    return (
      <div className="page-scroll">
        {library.missingTools.length > 0 && (
          <div className="library__banner">
            <MissingToolsCallout tools={library.missingTools} />
          </div>
        )}
        <EmptyState
          icon="film"
          title="No Videos"
          actions={
            <>
              <Button onClick={() => void reloadLibrary()}>Reload Library</Button>
              {library.skipped.length > 0 && (
                <Button onClick={onShowSkipped}>Show Skipped Files</Button>
              )}
            </>
          }
        >
          {library.skipped.length ? (
            `${counted(library.skipped.length, 'file was', 'files were')} skipped because the names don’t follow the studio-cast-title format.`
          ) : (
            <>
              Add videos named studio-cast-title to <code>{library.videosPath}</code>, then reload
              the library.
            </>
          )}
        </EmptyState>
      </div>
    )
  }

  const available = Math.max(0, box.width - PADDING * 2)
  const columns = Math.max(1, Math.floor((available + GAP_X) / (CARD_MIN + GAP_X)))
  const cardWidth = Math.min(CARD_MAX, (available - (columns - 1) * GAP_X) / columns)
  const rowHeight = (cardWidth * 9) / 16 + TEXT_HEIGHT + GAP_Y
  const rows = Math.ceil(visible.length / columns)
  const offset = PADDING + bannerHeight
  const { start, end } = visibleRange(rows, rowHeight, box.top, box.height, offset)
  const canRegenerate = library.missingTools.length === 0

  return (
    <div ref={scroller} className="page-scroll library__scroll">
      {notices}
      {visible.length === 0 ? (
        <EmptyState icon="search" title={`No Results for “${query.trim()}”`}>
          Check the spelling or try a new search.
        </EmptyState>
      ) : (
        box.width > 0 && (
          <ul
            className="library__grid"
            aria-label="Videos"
            style={{
              gridTemplateColumns: `repeat(${columns}, ${cardWidth}px)`,
              justifyContent: columns === 1 ? 'center' : 'start',
              gridAutoRows: `${rowHeight - GAP_Y}px`,
              columnGap: GAP_X,
              rowGap: GAP_Y,
              paddingTop: PADDING + start * rowHeight,
              height: Math.max(0, (rows - start) * rowHeight - GAP_Y),
              boxSizing: 'content-box'
            }}
          >
            {visible.slice(start * columns, end * columns).map((video) => (
              <VideoCard
                key={video.filename}
                video={video}
                selected={selection.has(video.filename)}
                selection={selection}
                regenerating={busy.has(video.filename) || video.regenerating}
                canRegenerate={canRegenerate}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )
      )}
    </div>
  )
}

function VideoCard({
  video,
  selected,
  selection,
  regenerating: working,
  canRegenerate,
  onDelete
}: {
  video: VideoSummary
  selected: boolean
  selection: ReadonlySet<string>
  regenerating: boolean
  canRegenerate: boolean
  onDelete: (names: string[]) => void
}) {
  const inGroup = selected && selection.size > 1
  const details = video.details ? detailParts(video.details) : null
  const caption = details
    ? [
        details.duration,
        details.resolution,
        details.frameRate,
        details.size,
        details.quality && `Quality ${details.quality}`
      ]
        .filter(Boolean)
        .join(' · ')
    : null
  return (
    <li className={`card${selected ? ' is-selected' : ''}${working ? ' is-working' : ''}`}>
      <button
        type="button"
        className="card__button"
        aria-pressed={selected}
        aria-label={`${video.title}, ${video.credits}`}
        title={tooltip(video)}
        onClick={() => toggleSelection(video.filename)}
        onContextMenu={(e) =>
          openMenuAt(e, video.title, [
            {
              label: selected ? 'Deselect' : 'Select',
              onSelect: () => toggleSelection(video.filename)
            },
            { separator: true },
            {
              label: revealLabel(),
              icon: 'folder',
              onSelect: () => void api.reveal({ kind: 'video', filename: video.filename })
            },
            {
              label: 'Open in Default App',
              icon: 'external',
              onSelect: () =>
                void api
                  .openInDefaultApp(video.filename)
                  .catch((error) => showError('Couldn’t Open the Video', error))
            },
            {
              label: 'Regenerate Contact Sheet',
              icon: 'regenerate',
              disabled: !canRegenerate || working,
              onSelect: () => void regenerate(video)
            },
            { separator: true },
            inGroup
              ? {
                  label: `Delete ${counted(selection.size, 'Video')}…`,
                  icon: 'trash',
                  destructive: true,
                  onSelect: () => onDelete([...selection])
                }
              : {
                  label: `Delete “${video.title}”…`,
                  icon: 'trash',
                  destructive: true,
                  onSelect: () => onDelete([video.filename])
                }
          ])
        }
      >
        <span className="card__media on-stage" {...hoverPreviewHandlers(video.previewUrl, caption)}>
          <Thumbnail src={video.thumbUrl} />
          <span className="card__badge" aria-hidden="true">
            <Icon name={selected ? 'checkCircle' : 'circle'} size={22} />
          </span>
          {working && (
            <span className="card__working" role="status" aria-label="Regenerating contact sheet">
              <span className="spinner" aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="card__text">
          <span className="card__title truncate">{video.title}</span>
          <span className="card__credits truncate">{video.credits}</span>
        </span>
      </button>
      {video.previewUrl && (
        <button
          type="button"
          className="card__preview"
          aria-label={`Preview ${video.title}`}
          title="Preview"
          onClick={() => openPreview(video.previewUrl!, video.title, caption)}
        >
          <Icon name="expand" size={16} />
        </button>
      )}
    </li>
  )
}
