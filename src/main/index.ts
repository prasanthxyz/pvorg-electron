/**
 * Main process: owns the library (SPEC §16). The renderer is sandboxed, context-isolated
 * and has no Node access; it reaches the library only through the typed preload API.
 */

import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeTheme,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
  type WebContents
} from 'electron'
import * as path from 'path'
import type { Appearance, Command, MenuState } from '../shared/types'
import { registerIpc, statusPayload, type IpcContext } from './ipc'
import { Library } from './library/library'
import { buildMenu, INITIAL_MENU_STATE } from './menu'
import {
  APP_ORIGIN,
  APP_SCHEME,
  CSP,
  MEDIA_SCHEME,
  mediaHandler,
  rendererHandler
} from './protocols'
import { SettingsStore } from './settings'
import { ThumbnailCache } from './thumbnails'
import icon from '../../resources/icon.png?asset'

const HOMEPAGE = 'https://github.com/prasanthxyz/PP-Video-Organizer'
const isDev = !app.isPackaged
const devServer = isDev ? process.env.ELECTRON_RENDERER_URL : undefined

// Test and QA runs keep their preferences and caches out of the user's data folder.
if (process.env.PVORG_USER_DATA) app.setPath('userData', path.resolve(process.env.PVORG_USER_DATA))

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  {
    scheme: MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  start()
}

function start(): void {
  let window: BrowserWindow | null = null
  let menuState: MenuState = INITIAL_MENU_STATE
  let lastMenu = ''

  const settings = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'))
  const rendererOrigin = devServer ? originOf(devServer) : APP_ORIGIN

  const send = (channel: string, payload: unknown): void => {
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
  }

  const library = new Library({
    configPath: () => settings.configPath().file,
    onStatus: () => send('pvorg:status', statusPayload(ctx))
  })

  const applyAppearance = (choice: Appearance): void => {
    nativeTheme.themeSource = choice
    refreshMenu(true)
  }

  const refreshMenu = (force = false): void => {
    const key = JSON.stringify([menuState, settings.get().appearance])
    if (!force && key === lastMenu) return
    lastMenu = key
    Menu.setApplicationMenu(
      buildMenu({
        state: menuState,
        appearance: settings.get().appearance,
        isDev,
        homepage: HOMEPAGE,
        send: (command: Command) => {
          if (command.type === 'reload' && !menuState.ready) {
            library.load()
            return
          }
          send('pvorg:command', command)
        },
        setAppearance: (choice) => {
          void settings.update({ appearance: choice }).then(() => {
            applyAppearance(choice)
            send('pvorg:command', { type: 'settingsChanged' } satisfies Command)
          })
        }
      })
    )
  }

  const isTrustedSender = (event: IpcMainInvokeEvent): boolean => {
    const url = event.senderFrame?.url
    if (!url || !window || event.sender !== window.webContents) return false
    try {
      return originOf(url) === rendererOrigin
    } catch {
      return false
    }
  }

  const ctx: IpcContext = {
    library,
    settings,
    isTrustedSender,
    applyAppearance,
    importFiles: new Set(),
    onMenuState: (state) => {
      menuState = state
      refreshMenu()
    }
  }
  registerIpc(ctx)

  app.on('second-instance', () => {
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  // Nothing navigates, opens windows, embeds webviews or asks for permissions.
  app.on('web-contents-created', (_, contents: WebContents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.on('will-navigate', (event, url) => {
      if (originOf(url) !== rendererOrigin) {
        event.preventDefault()
        openExternal(url)
      }
    })
    contents.setWindowOpenHandler(({ url }) => {
      openExternal(url)
      return { action: 'deny' }
    })
  })

  app.whenReady().then(() => {
    nativeTheme.themeSource = settings.get().appearance
    const ses = session.defaultSession
    ses.setPermissionRequestHandler((_, permission, callback) =>
      callback(permission === 'fullscreen')
    )
    ses.setPermissionCheckHandler((_, permission) => permission === 'fullscreen')
    if (devServer) {
      // The dev server's React refresh needs inline scripts and a websocket.
      ses.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders }
        if (details.url.startsWith(devServer)) {
          headers['Content-Security-Policy'] = [
            CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
              .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
              .replace("connect-src 'self'", `connect-src 'self' ws://${new URL(devServer).host}`)
          ]
        }
        callback({ responseHeaders: headers })
      })
    }

    const thumbnails = new ThumbnailCache(path.join(app.getPath('userData'), 'Thumbnails'))
    protocol.handle(APP_SCHEME, rendererHandler(path.join(__dirname, '../renderer')))
    protocol.handle(
      MEDIA_SCHEME,
      mediaHandler(library, thumbnails, () => [rendererOrigin])
    )

    app.setAppUserModelId('com.wordpress.prasanthxyz.pvorg')
    refreshMenu(true)
    window = createWindow()
    library.load()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) window = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  function createWindow(): BrowserWindow {
    const dark = nativeTheme.shouldUseDarkColors
    const win = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 960,
      minHeight: 600,
      show: false,
      title: 'P Video Organizer',
      backgroundColor: dark ? '#1e1e1e' : '#f5f5f7',
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
        devTools: isDev || process.env.PVORG_DEVTOOLS === '1'
      }
    })
    win.once('ready-to-show', () => {
      if (process.env.PVORG_HIDE_WINDOW !== '1') win.show()
    })
    win.on('closed', () => {
      if (window === win) window = null
    })
    // The page blocks unloading while mapping changes are unsaved; ask before discarding them.
    win.webContents.on('will-prevent-unload', (event) => {
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning',
        buttons: ['Cancel', 'Discard Changes'],
        defaultId: 0,
        cancelId: 0,
        message: 'Discard unsaved mapping changes?',
        detail: 'Gallery or Tag Mapping has changes that haven’t been saved to pvorg.json.'
      })
      if (choice === 1) event.preventDefault()
    })
    if (devServer) void win.loadURL(devServer)
    else void win.loadURL(`${APP_ORIGIN}/index.html`)
    return win
  }
}

/** scheme://host — Node's URL reports "null" as the origin of custom schemes. */
function originOf(url: string): string {
  try {
    const { protocol: scheme, host } = new URL(url)
    return `${scheme}//${host}`
  } catch {
    return ''
  }
}

function openExternal(url: string): void {
  try {
    const { protocol: scheme } = new URL(url)
    if (scheme === 'https:' || scheme === 'http:') void shell.openExternal(url)
  } catch {
    /* ignore malformed URLs */
  }
}
