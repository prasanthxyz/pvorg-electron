/**
 * The native application menu (SPEC §16 Structure, §7.1 accelerators).
 *
 * Single-key shortcuts (V, C, P, B, N, ⌫, Space, arrows, digits) are shown in the menu but
 * not registered with the system: the page handles them, so typing in a text field always
 * wins. Clicking an item sends the same command to the page.
 */

import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import type { Appearance, Command, MenuState } from '../shared/types'

export interface MenuContext {
  state: MenuState
  appearance: Appearance
  isDev: boolean
  send: (command: Command) => void
  setAppearance: (choice: Appearance) => void
  homepage: string
}

export const INITIAL_MENU_STATE: MenuState = {
  ready: false,
  page: 'other',
  hasCombination: false,
  videoMode: false,
  canUndo: null,
  canRedo: null,
  hasSelection: false,
  hasVideos: false,
  pendingChanges: 0
}

export function buildMenu(ctx: MenuContext): Menu {
  const mac = process.platform === 'darwin'
  const { state, send } = ctx
  const ready = state.ready
  const viewer = ready && state.page === 'viewer' && state.hasCombination
  const playing = viewer && state.videoMode
  const library = ready && state.page === 'library'
  const mapping = ready && (state.page === 'galleries' || state.page === 'tags')
  const go = (path: string) => () => send({ type: 'navigate', path })
  const command = (type: Exclude<Command, { type: 'navigate' } | { type: 'jump' }>['type']) => () =>
    send({ type } as Command)
  /** Shown, but handled by the page so it never swallows typing. */
  const key = (accelerator: string): Partial<MenuItemConstructorOptions> => ({
    accelerator,
    registerAccelerator: false
  })

  const settingsItem: MenuItemConstructorOptions = {
    label: mac ? 'Settings…' : 'Settings',
    accelerator: 'CmdOrCtrl+,',
    click: go('/settings')
  }

  const template: MenuItemConstructorOptions[] = [
    ...(mac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              settingsItem,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          } as MenuItemConstructorOptions
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Reload Library', accelerator: 'CmdOrCtrl+R', click: command('reload') },
        { label: 'Clean Up Stale Entries…', enabled: ready, click: command('cleanup') },
        { label: 'Import from pvorg.yml…', enabled: ready, click: command('import') },
        { type: 'separator' },
        {
          label: 'Save Mapping Changes',
          accelerator: 'CmdOrCtrl+S',
          enabled: mapping && state.pendingChanges > 0,
          click: command('save')
        },
        {
          label: 'Revert Mapping Changes…',
          enabled: mapping && state.pendingChanges > 0,
          click: command('revert')
        },
        { type: 'separator' },
        { label: 'Choose Library File…', click: command('chooseLibrary') },
        ...(mac
          ? [{ type: 'separator' }, { role: 'close' }]
          : [{ type: 'separator' }, settingsItem, { type: 'separator' }, { role: 'quit' }])
      ] as MenuItemConstructorOptions[]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: state.canUndo ? `Undo ${state.canUndo}` : 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: command('undo')
        },
        {
          label: state.canRedo ? `Redo ${state.canRedo}` : 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          click: command('redo')
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          click: command('selectAll')
        },
        {
          label: 'Deselect All',
          ...key('Escape'),
          enabled: library && state.hasSelection,
          click: command('deselectAll')
        },
        { type: 'separator' },
        {
          label: 'Delete Selected Videos…',
          ...(library ? (mac ? { accelerator: 'Cmd+Backspace' } : key('Delete')) : {}),
          enabled: library && state.hasSelection,
          click: command('deleteSelection')
        },
        { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: command('find') }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Appearance',
          submenu: (['system', 'light', 'dark'] as const).map((choice) => ({
            label: choice === 'system' ? 'System' : choice === 'light' ? 'Light' : 'Dark',
            type: 'radio',
            checked: ctx.appearance === choice,
            click: () => ctx.setAppearance(choice)
          }))
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(ctx.isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : [])
      ] as MenuItemConstructorOptions[]
    },
    {
      label: 'Go',
      submenu: [
        { label: 'Viewer', ...key('V'), enabled: ready, click: go('/') },
        { label: 'Filters', ...key('C'), enabled: ready, click: go('/filters') },
        { type: 'separator' },
        { label: 'Library', enabled: ready, click: go('/library') },
        { label: 'Gallery Mapping', enabled: ready, click: go('/mapping/galleries') },
        { label: 'Tag Mapping', enabled: ready, click: go('/mapping/tags') }
      ]
    },
    {
      label: 'Viewer',
      submenu: [
        {
          label: state.videoMode ? 'Show Contact Sheet' : 'Play Video',
          ...key('P'),
          enabled: viewer,
          click: command('toggleMode')
        },
        { label: 'Previous Combination', ...key('B'), enabled: viewer, click: command('previous') },
        { label: 'Next Combination', ...key('N'), enabled: viewer, click: command('next') },
        { type: 'separator' },
        {
          label: 'Exclude Pairing',
          ...key('Backspace'),
          enabled: viewer,
          click: command('exclude')
        },
        { type: 'separator' },
        { label: 'Play/Pause', ...key('Space'), enabled: playing, click: command('playPause') },
        {
          label: 'Skip Back 10 Seconds',
          ...key('Left'),
          enabled: playing,
          click: command('skipBack')
        },
        {
          label: 'Skip Forward 10 Seconds',
          ...key('Right'),
          enabled: playing,
          click: command('skipForward')
        },
        {
          label: 'Jump To',
          enabled: playing,
          submenu: Array.from({ length: 10 }, (_, tenth) => ({
            label: `${tenth * 10}%`,
            ...key(String(tenth)),
            enabled: playing,
            click: () => send({ type: 'jump', tenth })
          }))
        },
        { type: 'separator' },
        { label: 'Volume Up', ...key('Up'), enabled: playing, click: command('volumeUp') },
        { label: 'Volume Down', ...key('Down'), enabled: playing, click: command('volumeDown') },
        { label: 'Mute', ...key('M'), enabled: playing, click: command('mute') },
        { label: 'Full Screen Video', ...key('F'), enabled: playing, click: command('fullScreen') }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'pvorg on GitHub',
          click: () => void shell.openExternal(ctx.homepage)
        }
      ]
    }
  ]
  return Menu.buildFromTemplate(template)
}
