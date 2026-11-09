import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { openCleanup } from '../components/CleanupDialog'
import { openImport } from '../components/ImportDialog'
import { IconButton } from '../components/controls'
import { Icon, type IconName } from '../components/Icon'
import { openMenuFrom } from '../components/Menu'
import { changeCount, mappingSessions } from '../state/mapping'
import { narrowWindow, SIDEBAR_ID, sidebarAnimating, sidebarHidden } from '../state/sidebar'
import { reloadLibrary, status } from '../state/status'
import { useStore } from '../state/store'
import { counted } from './format'

interface NavItem {
  to: string
  label: string
  icon: IconName
  shortcut?: string
  badge?: number
}

function useNavGroups(): { label: string; items: NavItem[] }[] {
  const galleries = changeCount(useStore(mappingSessions.galleries).pending)
  const tags = changeCount(useStore(mappingSessions.tags).pending)
  return [
    {
      label: 'Browse',
      items: [
        { to: '/', label: 'Viewer', icon: 'viewer', shortcut: 'V' },
        { to: '/filters', label: 'Filters', icon: 'filters', shortcut: 'C' }
      ]
    },
    {
      label: 'Organize',
      items: [
        { to: '/library', label: 'Library', icon: 'library' },
        {
          to: '/mapping/galleries',
          label: 'Gallery Mapping',
          icon: 'galleryMapping',
          badge: galleries
        },
        { to: '/mapping/tags', label: 'Tag Mapping', icon: 'tagMapping', badge: tags }
      ]
    }
  ]
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const groups = useNavGroups()
  const library = useStore(status)?.library

  return (
    <>
      <div className="nav__brand">
        <Icon name="clapper" size={20} />
        <span>PP Video Organizer</span>
      </div>
      <nav className="nav__groups" aria-label="Pages">
        {groups.map((group) => (
          <div key={group.label} className="nav__group">
            <h2 className="nav__heading">{group.label}</h2>
            <ul>
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end
                    className="nav__link"
                    title={item.shortcut ? `${item.label} (${item.shortcut})` : undefined}
                    onClick={onNavigate}
                  >
                    <Icon name={item.icon} size={18} />
                    <span className="nav__label">{item.label}</span>
                    {!!item.badge && (
                      <span
                        className="nav__badge tabular"
                        aria-label={counted(item.badge, 'unsaved change')}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="nav__footer">
        <p className="nav__summary tabular">
          <Icon name="film" size={14} />
          {library ? (
            <span>
              <span className="nowrap">{counted(library.videos, 'video')} ·</span>{' '}
              <span className="nowrap">{counted(library.galleries, 'gallery', 'galleries')}</span>
            </span>
          ) : (
            '—'
          )}
        </p>
        <div className="nav__footer-actions">
          <NavLink
            to="/settings"
            className="nav__icon-link"
            aria-label="Settings"
            title="Settings"
            onClick={onNavigate}
          >
            <Icon name="settings" size={18} />
          </NavLink>
          <IconButton
            icon="more"
            label="More"
            onClick={(e) => {
              onNavigate?.()
              openMenuFrom(e.currentTarget, 'Library actions', [
                { label: 'Reload Library', icon: 'refresh', onSelect: () => void reloadLibrary() },
                { label: 'Clean Up Stale Entries…', icon: 'cleanup', onSelect: openCleanup },
                {
                  label: 'Import from pvorg.yml…',
                  icon: 'import',
                  onSelect: () => void openImport()
                }
              ])
            }}
          />
        </div>
      </div>
    </>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawer = useRef<HTMLDialogElement>(null)
  const location = useLocation()
  const hidden = useStore(sidebarHidden) === true
  const narrow = useStore(narrowWindow)
  const animating = useStore(sidebarAnimating)

  useEffect(() => {
    if (drawerOpen) drawer.current?.showModal()
    else drawer.current?.close()
  }, [drawerOpen])

  useEffect(() => setDrawerOpen(false), [location.pathname])

  return (
    <div
      className={`shell${animating ? ' shell--animating' : ''}`}
      data-sidebar={hidden ? 'hidden' : 'shown'}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside id={SIDEBAR_ID} className="sidebar" aria-label="Sidebar" inert={hidden && !narrow}>
        <div className="sidebar__content">
          <Navigation />
        </div>
      </aside>
      <header className="topbar">
        <IconButton icon="menu" label="Open navigation" onClick={() => setDrawerOpen(true)} />
        <span className="topbar__brand">
          <Icon name="clapper" size={18} /> PP Video Organizer
        </span>
      </header>
      <dialog
        ref={drawer}
        className="drawer"
        aria-label="Navigation"
        onCancel={(e) => {
          e.preventDefault()
          setDrawerOpen(false)
        }}
        onClick={(e) => e.target === drawer.current && setDrawerOpen(false)}
      >
        <div className="drawer__panel">
          <IconButton
            className="drawer__close"
            icon="close"
            label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <Navigation onNavigate={() => setDrawerOpen(false)} />
        </div>
      </dialog>
      <main id="main" className="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
