import { counted } from '../app/format'
import { changeCount, mappingSessions } from '../state/mapping'
import { SIDEBAR_ID, SIDEBAR_TOGGLE_ID, sidebarHidden, toggleSidebar } from '../state/sidebar'
import { isMac } from '../state/status'
import { useStore } from '../state/store'
import { Icon } from './Icon'

/**
 * The page header's leading button that hides and shows the sidebar (SPEC §4.1). While the
 * sidebar is hidden it carries a dot for unsaved mapping changes, standing in for the badges.
 */
export function SidebarToggle() {
  const hidden = useStore(sidebarHidden) === true
  const pending =
    changeCount(useStore(mappingSessions.galleries).pending) +
    changeCount(useStore(mappingSessions.tags).pending)
  const dot = hidden && pending > 0
  const action = hidden ? 'Show Sidebar' : 'Hide Sidebar'
  const shortcut = isMac() ? '⌃⌘S' : 'Ctrl+\\'
  return (
    <button
      type="button"
      id={SIDEBAR_TOGGLE_ID}
      className={`icon-btn icon-btn--ghost sidebar-toggle${dot ? ' sidebar-toggle--pending' : ''}`}
      aria-label={dot ? `${action}, ${counted(pending, 'unsaved mapping change')}` : action}
      aria-expanded={!hidden}
      aria-controls={SIDEBAR_ID}
      title={`${action} (${shortcut})`}
      onClick={toggleSidebar}
    >
      <Icon name="sidebarLeft" />
    </button>
  )
}
