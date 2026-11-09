import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { ViewerState } from '../api/types'
import { setMenuBits, usePageCommands } from '../app/shortcuts'
import { Button, IconButton, Segmented } from '../components/controls'
import { EmptyState, PageHeader } from '../components/feedback'
import { openMenuAt } from '../components/Menu'
import { Thumbnail } from '../components/Thumbnail'
import {
  bumpData,
  dataVersion,
  pushUndo,
  showError,
  showToast,
  undo,
  type UndoEntry
} from '../state/feedback'
import { mappingSessions } from '../state/mapping'
import { reloadLibrary, revealLabel, status } from '../state/status'
import { createStore, useStore } from '../state/store'
import { Slideshow } from './viewer/Slideshow'
import { VideoStage, type PlayerHandle } from './viewer/VideoStage'

/** Viewer data outlives the page, so undo can update it from anywhere. */
const viewerStore = createStore<ViewerState | null>(null)

// A reload or another library makes the old combination meaningless: never render it again.
status.subscribe(() => {
  if (status.get()?.phase !== 'ready') viewerStore.set(null)
})

type Mode = 'sheet' | 'video'

const identity = (v: ViewerState | null) =>
  v?.current ? `${v.current.video.filename}\u0000${v.current.gallery.name}` : ''

/** Exclude a pairing, confirm it, and record how to undo it (SPEC §3.6). */
async function excludePairing(
  filename: string,
  gallery: string,
  title: string
): Promise<UndoEntry> {
  const { exclusionId, viewer } = await api.exclude(filename, gallery)
  viewerStore.set(viewer)
  // The viewer decision supersedes an unsaved Gallery Mapping edit of the same cell.
  mappingSessions.galleries.set((session) => {
    const cells = session.pending[filename]
    if (!cells?.[gallery]) return session
    const { [gallery]: _, ...rest } = cells
    const pending = { ...session.pending }
    if (Object.keys(rest).length) pending[filename] = rest
    else delete pending[filename]
    return { ...session, pending }
  })
  bumpData()
  showToast(`Excluded “${gallery}” from “${title}”`, 'thumbsDown', {
    label: 'Undo',
    run: () => void undo()
  })
  return {
    label: 'Exclude Pairing',
    undo: async () => {
      const { viewer: restored } = await api.restore(exclusionId)
      viewerStore.set(restored)
      bumpData()
      // Undoing by any route replaces the Exclude message, so a stale Undo never lingers.
      showToast(`Restored “${gallery}” for “${title}”`)
      return {
        label: 'Exclude Pairing',
        undo: () => excludePairing(filename, gallery, title)
      }
    }
  }
}

export default function ViewerPage() {
  const viewer = useStore(viewerStore)
  const version = useStore(dataVersion)
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('sheet')
  // Once opened, the video stays mounted for this combination, so returning to it resumes.
  const [videoOpened, setVideoOpened] = useState(false)
  const player = useRef<PlayerHandle>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let cancelled = false
    api
      .viewer()
      .then((v) => !cancelled && viewerStore.set(v))
      .catch((e) => showError('Couldn’t Load the Viewer', e))
    return () => {
      cancelled = true
    }
  }, [version])

  // A new combination always starts on its contact sheet.
  const key = identity(viewer)
  useEffect(() => {
    setMode('sheet')
    setVideoOpened(false)
  }, [key])
  useEffect(() => {
    if (mode === 'video') setVideoOpened(true)
  }, [mode])

  // Prefetch the next contact sheet.
  useEffect(() => {
    if (viewer?.nextSheetUrl) {
      const img = new Image()
      img.decoding = 'async'
      img.src = viewer.nextSheetUrl
    }
  }, [viewer?.nextSheetUrl])

  const current = viewer?.current ?? null
  useEffect(() => {
    document.title = current ? `${current.video.title} – PP Video Organizer` : 'PP Video Organizer'
  }, [current])

  // Actions run one at a time, in the order they were requested, and each reads the
  // viewer state when it runs, so fast key presses are never dropped or stale (SPEC §7.1).
  const run = useCallback((action: () => Promise<void>, failure: string) => {
    queue.current = queue.current.then(action).catch((error) => showError(failure, error))
    return queue.current
  }, [])

  const move = (delta: number) =>
    run(async () => viewerStore.set(await api.move(delta)), 'Couldn’t Change Combination')

  const exclude = () =>
    run(async () => {
      const live = viewerStore.get()?.current
      if (!live) return
      pushUndo(await excludePairing(live.video.filename, live.gallery.name, live.video.title))
    }, 'Couldn’t Exclude Pairing')

  const toggleMode = () => current && setMode((m) => (m === 'sheet' ? 'video' : 'sheet'))

  useEffect(() => {
    setMenuBits({ hasCombination: !!current, videoMode: !!current && mode === 'video' })
  }, [current, mode])
  useEffect(() => () => setMenuBits({ hasCombination: false, videoMode: false }), [])

  usePageCommands((command) => {
    if (!current) return false
    switch (command.type) {
      case 'toggleMode':
        return (toggleMode(), true)
      case 'previous':
        return (void move(-1), true)
      case 'next':
        return (void move(1), true)
      case 'exclude':
        return (void exclude(), true)
    }
    const p = player.current
    if (mode !== 'video' || !p?.isReady()) return false
    switch (command.type) {
      case 'playPause':
        return (p.togglePlay(), true)
      case 'skipBack':
        return (p.seekBy(-10), true)
      case 'skipForward':
        return (p.seekBy(10), true)
      case 'jump':
        return (p.seekToFraction(command.tenth / 10), true)
      case 'volumeUp':
        return (p.changeVolume(0.1), true)
      case 'volumeDown':
        return (p.changeVolume(-0.1), true)
      case 'mute':
        return (p.toggleMute(), true)
      case 'fullScreen':
        return (p.toggleFullScreen(), true)
      default:
        return false
    }
  })

  if (!viewer) return <div className="viewer" aria-busy="true" />

  const header = (
    <PageHeader
      title={current?.video.title ?? 'Viewer'}
      subtitle={current?.video.credits ?? ''}
      actions={
        <>
          <IconButton
            icon="thumbsDown"
            label={
              current ? `Exclude “${current.gallery.name}” from this video` : 'Exclude Pairing'
            }
            shortcut="⌫"
            disabled={!current}
            onClick={() => void exclude()}
          />
          <Segmented<Mode>
            label="Display"
            value={mode}
            disabled={!current}
            onChange={setMode}
            options={[
              {
                value: 'sheet',
                label: 'Contact Sheet',
                icon: 'contactSheet',
                iconOnly: true,
                title: 'Contact Sheet (P)'
              },
              { value: 'video', label: 'Video', icon: 'play', iconOnly: true, title: 'Video (P)' }
            ]}
          />
          <div className="button-group">
            <IconButton
              icon="chevronLeft"
              label="Previous combination"
              shortcut="B"
              disabled={!viewer.total || viewer.total < 2}
              onClick={() => void move(-1)}
            />
            <IconButton
              icon="chevronRight"
              label="Next combination"
              shortcut="N"
              disabled={!viewer.total || viewer.total < 2}
              onClick={() => void move(1)}
            />
          </div>
          <span
            className="viewer__position tabular"
            aria-live="polite"
            style={{ visibility: viewer.total ? 'visible' : 'hidden' }}
          >
            {(viewer.position + 1).toLocaleString()} of {viewer.total.toLocaleString()}
          </span>
        </>
      }
    />
  )

  return (
    <div className="viewer">
      {header}
      {current ? (
        <div
          className="stage on-stage"
          onContextMenu={(e) =>
            openMenuAt(e, 'Combination', [
              {
                label: `Exclude “${current.gallery.name}” from This Video`,
                icon: 'thumbsDown',
                onSelect: () => void exclude()
              },
              { separator: true },
              {
                label: revealLabel(),
                icon: 'folder',
                onSelect: () => void api.reveal({ kind: 'video', filename: current.video.filename })
              },
              {
                label: 'Open in Default App',
                icon: 'external',
                onSelect: () =>
                  void api
                    .openInDefaultApp(current.video.filename)
                    .catch((error) => showError('Couldn’t Open the Video', error))
              }
            ])
          }
        >
          <div className="stage__media" key={key}>
            {mode === 'sheet' &&
              (current.video.sheetUrl ? (
                <div
                  className="stage__sheet"
                  onDoubleClick={() => setMode('video')}
                  title="Double-click to play"
                >
                  <Thumbnail
                    src={current.video.sheetUrl}
                    fit="contain"
                    eager
                    alt={`Contact sheet for ${current.video.title}`}
                  />
                </div>
              ) : (
                <div className="stage__state">
                  <EmptyState
                    icon="contactSheet"
                    title="No Contact Sheet"
                    actions={
                      <Button variant="primary" onClick={() => setMode('video')}>
                        Play Video
                      </Button>
                    }
                  >
                    A preview couldn’t be generated for this video. Reloading the library tries
                    again.
                  </EmptyState>
                </div>
              ))}
            {(mode === 'video' || videoOpened) && (
              <div className="stage__video" hidden={mode !== 'video'}>
                <VideoStage
                  ref={player}
                  combination={current}
                  active={mode === 'video'}
                  onShowContactSheet={() => setMode('sheet')}
                />
              </div>
            )}
          </div>
          <Slideshow name={current.gallery.name} images={current.gallery.images} />
        </div>
      ) : (
        <div className="stage stage--empty on-stage">
          <ViewerEmpty
            viewer={viewer}
            onEditFilters={() => navigate('/filters')}
            onMapping={() => navigate('/mapping/galleries')}
          />
        </div>
      )}
    </div>
  )
}

function ViewerEmpty({
  viewer,
  onEditFilters,
  onMapping
}: {
  viewer: ViewerState
  onEditFilters: () => void
  onMapping: () => void
}) {
  const empty = viewer.empty
  if (!empty) return null
  switch (empty.reason) {
    case 'noVideos':
      return (
        <EmptyState
          icon="film"
          title="No Videos"
          actions={<Button onClick={() => void reloadLibrary()}>Reload Library</Button>}
        >
          PP Video Organizer didn’t find any videos in <code>{empty.videosPath}</code>.
        </EmptyState>
      )
    case 'noGalleries':
      return (
        <EmptyState
          icon="photos"
          title="No Galleries"
          actions={<Button onClick={() => void reloadLibrary()}>Reload Library</Button>}
        >
          Add folders of images to <code>{empty.galleriesPath}</code>, then reload the library.
        </EmptyState>
      )
    case 'filters':
      return (
        <EmptyState
          icon="filters"
          title="No Matching Combinations"
          actions={
            <>
              <Button variant="primary" onClick={onEditFilters}>
                Edit Filters
              </Button>
              <Button onClick={() => void api.resetFilters().then(() => bumpData())}>
                Reset Filters
              </Button>
            </>
          }
        >
          Your filters exclude every video and gallery pairing.
          {empty.tagsRequired &&
            ' Required tags only match videos marked Yes for them in Tag Mapping.'}
        </EmptyState>
      )
    default:
      return (
        <EmptyState
          icon="photos"
          title="No Combinations"
          actions={<Button onClick={onMapping}>Open Gallery Mapping</Button>}
        >
          Every video is excluded from every gallery. Include some galleries in Gallery Mapping.
        </EmptyState>
      )
  }
}
