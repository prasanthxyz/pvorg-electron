import { useEffect, useRef } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { api, bridge } from '../api/client'
import type { Command, MenuState, Page } from '../api/types'
import { CleanupDialog, openCleanup } from '../components/CleanupDialog'
import { Button } from '../components/controls'
import { AlertHost } from '../components/Dialog'
import { EmptyState, ToastRegion } from '../components/feedback'
import { ImportDialog, openImport } from '../components/ImportDialog'
import { MenuHost } from '../components/Menu'
import { hidePreview, PreviewHost } from '../components/Preview'
import FiltersPage from '../pages/FiltersPage'
import LibraryPage from '../pages/LibraryPage'
import MappingPage from '../pages/MappingPage'
import SettingsPage from '../pages/SettingsPage'
import ViewerPage from '../pages/ViewerPage'
import { loadAppearance } from '../state/appearance'
import { bumpData, redo, showError, undo, undoState } from '../state/feedback'
import { librarySelection } from '../state/library'
import { changeCount, hasAnyPending, mappingSessions } from '../state/mapping'
import { loadSidebar, narrowWindow, sidebarHidden, toggleSidebar } from '../state/sidebar'
import { reloadLibrary, status, watchStatus } from '../state/status'
import { useStore } from '../state/store'
import { installKeyboard, isEditable, isModalOpen, menuBits, runPageCommand } from './shortcuts'
import { Shell } from './Shell'
import { StartupError, StartupProgress } from './Startup'

function NotFound() {
  const navigate = useNavigate()
  return (
    <EmptyState
      icon="viewer"
      title="Page Not Found"
      actions={<Button onClick={() => navigate('/')}>Open Viewer</Button>}
    >
      This page isn’t part of PP Video Organizer.
    </EmptyState>
  )
}

/** Moves focus to the page heading after in-app navigation, for screen readers and keyboard users. */
function useFocusOnNavigate() {
  const location = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const heading = document.getElementById('page-title')
    if (heading) {
      heading.setAttribute('tabindex', '-1')
      heading.focus({ preventScroll: true })
    }
  }, [location.pathname])
}

function pageOf(pathname: string): Page {
  switch (pathname) {
    case '/':
      return 'viewer'
    case '/filters':
      return 'filters'
    case '/library':
      return 'library'
    case '/mapping/galleries':
      return 'galleries'
    case '/mapping/tags':
      return 'tags'
    case '/settings':
      return 'settings'
    default:
      return 'other'
  }
}

/** Keeps the native menu's enabled items and labels in step with the page (SPEC §7.1). */
function useMenuState(ready: boolean) {
  const location = useLocation()
  const bits = useStore(menuBits)
  const undos = useStore(undoState)
  const selection = useStore(librarySelection)
  const galleries = changeCount(useStore(mappingSessions.galleries).pending)
  const tags = changeCount(useStore(mappingSessions.tags).pending)
  const narrow = useStore(narrowWindow)
  const page = pageOf(location.pathname)
  const last = useRef('')
  useEffect(() => {
    const state: MenuState = {
      ready,
      page,
      hasCombination: !!bits.hasCombination,
      videoMode: !!bits.videoMode,
      canUndo: undos.undo.at(-1)?.label ?? null,
      canRedo: undos.redo.at(-1)?.label ?? null,
      hasSelection: selection.size > 0,
      hasVideos: !!bits.hasVideos,
      pendingChanges: page === 'galleries' ? galleries : page === 'tags' ? tags : 0,
      sidebarToggle: ready && !narrow
    }
    const key = JSON.stringify(state)
    if (key === last.current) return
    last.current = key
    void api.setMenuState(state).catch(() => undefined)
  }, [ready, page, bits, undos, selection, galleries, tags, narrow])
}

/** Text fields keep their own undo and selection: the editing command a menu role would send. */
function editCommand(name: 'undo' | 'redo' | 'selectAll'): void {
  document.execCommand(name)
}

export default function App() {
  const current = useStore(status)
  const navigate = useNavigate()
  const ready = current?.phase === 'ready'
  const sidebarLoaded = useStore(sidebarHidden) !== null
  const readyRef = useRef(ready)
  readyRef.current = ready

  useEffect(() => {
    void watchStatus().catch((error) => showError('Couldn’t Start PP Video Organizer', error))
    void loadAppearance().catch(() => undefined)
    void loadSidebar()
  }, [])

  useEffect(() => installKeyboard(navigate, () => readyRef.current), [navigate])

  useEffect(() => {
    const handle = (command: Command): void => {
      const editing = isEditable(document.activeElement)
      switch (command.type) {
        case 'navigate':
          if (readyRef.current && !isModalOpen()) navigate(command.path)
          return
        case 'reload':
          void reloadLibrary()
          return
        case 'settingsChanged':
          void loadAppearance()
          bumpData()
          return
        case 'toggleSidebar':
          if (readyRef.current) toggleSidebar()
          return
        case 'chooseLibrary':
          void api
            .chooseLibraryFile()
            .catch((error) => showError('Couldn’t Choose a Library', error))
          return
        case 'undo':
        case 'redo':
          if (editing) editCommand(command.type)
          else if (!isModalOpen()) void (command.type === 'undo' ? undo() : redo())
          return
        case 'selectAll':
          if (editing || isModalOpen() || !runPageCommand(command)) editCommand('selectAll')
          return
      }
      if (!readyRef.current || isModalOpen()) return
      if (command.type === 'cleanup') openCleanup()
      else if (command.type === 'import') openImport()
      else runPageCommand(command)
    }
    return bridge().onCommand(handle)
  }, [navigate])

  useEffect(() => {
    // Unsaved mapping changes: the main process asks before the window closes.
    const warn = (e: BeforeUnloadEvent) => {
      if (hasAnyPending()) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  useFocusOnNavigate()
  useMenuState(ready)

  // A hover preview belongs to the card under the pointer; it never outlives the page.
  const location = useLocation()
  useEffect(() => hidePreview(), [location.pathname, ready])

  let content
  if (current?.phase === 'error') content = <StartupError status={current} />
  else if (!ready || !sidebarLoaded) content = <StartupProgress status={current} />
  else
    content = (
      <Shell>
        <Routes>
          <Route path="/" element={<ViewerPage />} />
          <Route path="/filters" element={<FiltersPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route
            path="/mapping/galleries"
            element={<MappingPage key="galleries" kind="galleries" />}
          />
          <Route path="/mapping/tags" element={<MappingPage key="tags" kind="tags" />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Shell>
    )

  return (
    <>
      {content}
      <ToastRegion />
      <AlertHost />
      <MenuHost />
      <PreviewHost />
      {ready && <CleanupDialog />}
      {ready && <ImportDialog />}
    </>
  )
}
