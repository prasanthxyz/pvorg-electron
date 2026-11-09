/**
 * Visual QA and end-to-end checks against the real Electron app (SPEC §16 Verification).
 *
 *   npm run build && node qa/tour.mts            # full tour: screenshots + checks
 *   PVORG_TOUR_MODE=smoke PVORG_APP=<exe> node qa/tour.mts   # launch a packaged build
 *
 * It copies the fixture library (scripts/make-fixture.sh) to a scratch folder, launches the
 * app sandboxed with its own user-data folder, screenshots every page and state in Dark and
 * Light at 1440×900 and 960×600, runs the keyboard, Exclude Pairing, delete, mapping, tag,
 * import and security checks, and writes results.txt. It exits non-zero on any failure.
 */

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const BASE = process.env.PVORG_FIXTURE ?? '/tmp/pvorg-desktop-fixture'
const RUN = process.env.PVORG_RUN_DIR ?? '/tmp/pvorg-desktop-run'
const OUT = process.env.PVORG_TOUR_DIR ?? '/tmp/pvorg-desktop-tour'
const USER_DATA = `${RUN}-userdata`
const MODE = process.env.PVORG_TOUR_MODE ?? 'full'
const APP = process.env.PVORG_APP
const MAIN = path.join(RUN, 'main')
const CONFIG = path.join(MAIN, 'pvorg.json')

const APPEARANCES = (process.env.PVORG_TOUR_APPEARANCES ?? 'dark,light').split(',')
const SIZES = (process.env.PVORG_TOUR_SIZES ?? '1440x900,960x600')
  .split(',')
  .map((size) => size.split('x').map(Number) as [number, number])

// ---------------------------------------------------------------- results

const results: { name: string; ok: boolean; detail: string }[] = []
const consoleErrors: string[] = []
let expectingErrors = false

async function check(name: string, run: () => Promise<string | void>): Promise<boolean> {
  try {
    const detail = (await run()) ?? ''
    results.push({ name, ok: true, detail })
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`)
    return true
  } catch (error) {
    const detail = (error as Error).message.split('\n')[0]
    results.push({ name, ok: false, detail })
    console.log(`FAIL ${name} — ${detail}`)
    return false
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

// ---------------------------------------------------------------- fixture

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function writeLibrary(dir: string, config: Record<string, unknown>): string {
  mkdirSync(path.join(dir, 'videos'), { recursive: true })
  mkdirSync(path.join(dir, 'galleries'), { recursive: true })
  const file = path.join(dir, 'pvorg.json')
  writeFileSync(
    file,
    JSON.stringify(
      {
        videosPath: path.join(dir, 'videos'),
        galleriesPath: path.join(dir, 'galleries'),
        tags: [],
        videoRelations: {},
        ...config
      },
      null,
      2
    ) + '\n'
  )
  return file
}

function copyVideo(name: string, dir: string, withSheet: boolean): void {
  copyFileSync(path.join(BASE, 'videos', name), path.join(dir, 'videos', name))
  if (withSheet) {
    mkdirSync(path.join(dir, 'videos', 'img'), { recursive: true })
    copyFileSync(
      path.join(BASE, 'videos', 'img', `${name}.jpg`),
      path.join(dir, 'videos', 'img', `${name}.jpg`)
    )
  }
}

function copyGallery(name: string, dir: string, as = name): void {
  cpSync(path.join(BASE, 'galleries', name), path.join(dir, 'galleries', as), { recursive: true })
}

const libraries: Record<string, string> = {}

function prepare(): void {
  assert(
    existsSync(path.join(BASE, 'pvorg.json')),
    `No fixture at ${BASE}: run scripts/make-fixture.sh`
  )
  for (const dir of [RUN, USER_DATA]) rmSync(dir, { recursive: true, force: true })
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  cpSync(BASE, MAIN, { recursive: true })
  writeFileSync(CONFIG, readFileSync(CONFIG, 'utf8').split(BASE).join(MAIN))
  libraries.main = CONFIG

  const videos = readdirSync(path.join(BASE, 'videos')).filter((f) =>
    /^[a-z].*-.*-.*\.mp4$/.test(f)
  )
  const sheets = (n: number) =>
    videos.filter((v) => existsSync(path.join(BASE, 'videos', 'img', `${v}.jpg`))).slice(0, n)

  // Startup progress: videos without contact sheets yet.
  const fresh = path.join(RUN, 'fresh')
  libraries.fresh = writeLibrary(fresh, {})
  for (const v of videos.slice(0, 10)) copyVideo(v, fresh, false)
  copyGallery('Beach Days', fresh)

  // Startup error.
  libraries.broken = path.join(RUN, 'broken.json')
  writeFileSync(libraries.broken, '{\n  "videosPath": "/nowhere",\n  "tags": [\n')

  // No videos, with entries left over: No Videos and the high-risk cleanup.
  const noVideos = path.join(RUN, 'no-videos')
  libraries.noVideos = writeLibrary(noVideos, {
    tags: ['night'],
    videoRelations: Object.fromEntries(
      videos
        .slice(0, 4)
        .map((v) => [v, { galleries: [], excludedGalleries: [], tags: [], excludedTags: [] }])
    )
  })
  copyGallery('Beach Days', noVideos)

  // No galleries and no tags.
  const noGalleries = path.join(RUN, 'no-galleries')
  libraries.noGalleries = writeLibrary(noGalleries, {})
  for (const v of sheets(3)) copyVideo(v, noGalleries, true)

  // Every video excluded from every gallery.
  const excluded = path.join(RUN, 'all-excluded')
  const pair = sheets(2)
  libraries.allExcluded = writeLibrary(excluded, {
    tags: ['night'],
    videoRelations: Object.fromEntries(
      pair.map((v) => [
        v,
        {
          galleries: [],
          excludedGalleries: ['Beach Days', 'Portraits'],
          tags: [],
          excludedTags: []
        }
      ])
    )
  })
  for (const v of pair) copyVideo(v, excluded, true)
  copyGallery('Beach Days', excluded)
  copyGallery('Portraits', excluded)
}

// ---------------------------------------------------------------- app

interface Session {
  app: ElectronApplication
  page: Page
}

async function launch(env: Record<string, string> = {}): Promise<Session> {
  const app = await electron.launch({
    ...(APP ? { executablePath: APP, args: [] } : { args: [ROOT] }),
    cwd: ROOT,
    colorScheme: null,
    chromiumSandbox: true,
    env: {
      ...(process.env as Record<string, string>),
      PVORG_CONFIG: CONFIG,
      PVORG_USER_DATA: USER_DATA,
      PVORG_HIDE_WINDOW: '1',
      ...env
    }
  })
  // Closing with unsaved mapping changes asks first; the tour always discards them.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = (() => 1) as never
  })
  const page = await app.firstWindow()
  page.on('console', (message) => {
    if (message.type() !== 'error' || expectingErrors) return
    // Failed loads are reported with their URL by the response listener.
    if (!message.text().startsWith('Failed to load resource')) consoleErrors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.status() >= 400 && !expectingErrors) {
      consoleErrors.push(`${response.status()} ${decodeURIComponent(response.url())}`)
    }
  })
  page.on('pageerror', (error) => {
    if (!expectingErrors) consoleErrors.push(`pageerror: ${error.message}`)
  })
  return { app, page }
}

async function ready(page: Page): Promise<void> {
  await page.waitForSelector('.shell .page-header', { timeout: 180_000 })
  await page.waitForTimeout(300)
}

async function resize({ app, page }: Session, width: number, height: number): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h),
    [width, height]
  )
  await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height])
  await page.waitForTimeout(250)
}

async function menu({ app }: Session, id: string): Promise<void> {
  const found = await app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId)
    if (!item) return false
    // A click as the menu would make it, with the focused window.
    item.click()
    return true
  }, id)
  assert(found, `No menu item ${id}`)
}

async function stubOpenDialog({ app }: Session, file: string): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as never
  }, file)
}

async function setAppearance(session: Session, appearance: string): Promise<void> {
  await menu(session, `appearance-${appearance}`)
  await session.page.waitForFunction(
    (a) => document.documentElement.dataset.theme === a,
    appearance === 'system' ? 'light' : appearance
  )
  await session.page.waitForTimeout(200)
}

async function go(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    location.hash = h
  }, hash)
  await page.waitForTimeout(450)
}

async function switchLibrary(session: Session, file: string, wait = true): Promise<void> {
  await stubOpenDialog(session, file)
  await session.page.evaluate(() => window.pvorg.invoke('chooseLibraryFile'))
  if (wait) {
    await session.page.waitForFunction(
      () =>
        document.querySelector('.shell .page-header, .startup[role="alert"]') !== null &&
        !document.querySelector('.startup[role="status"]'),
      undefined,
      { timeout: 180_000 }
    )
    await session.page.waitForTimeout(400)
  }
}

async function images(page: Page): Promise<void> {
  // Let visible thumbnails decode and fade in.
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll<HTMLImageElement>('img')].every(
          (img) => img.complete || img.loading === 'lazy'
        ),
      undefined,
      { timeout: 10_000 }
    )
    .catch(() => undefined)
  await page.waitForTimeout(350)
}

let prefix = ''
const shots: string[] = []

async function shot(page: Page, name: string): Promise<void> {
  await images(page)
  const file = path.join(OUT, `${prefix}${name}.png`)
  await page.screenshot({ path: file })
  shots.push(file)
}

async function escape(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
}

/** Moves the viewer to the first combination matching `match`, via the API, then reloads the page. */
async function showCombination(
  page: Page,
  match: { filename?: RegExp; gallery?: string }
): Promise<boolean> {
  const found = await page.evaluate(
    async ({ filename, gallery }) => {
      const regex = filename ? new RegExp(filename) : null
      const first = await window.pvorg.invoke('viewer')
      for (let i = 0; i < first.total; i++) {
        const v = await window.pvorg.invoke('goto', i)
        const c = v.current
        if (!c) continue
        if (regex && !regex.test(c.video.filename)) continue
        if (gallery && c.gallery.name !== gallery) continue
        return true
      }
      return false
    },
    { filename: match.filename?.source, gallery: match.gallery }
  )
  await go(page, '#/filters')
  await go(page, '#/')
  await page.waitForTimeout(300)
  return found
}

const toastText = (page: Page) => page.locator('.toast__message').innerText({ timeout: 5000 })

// ---------------------------------------------------------------- screenshots

async function tourMain(session: Session): Promise<void> {
  const { page } = session

  // Viewer
  await go(page, '#/')
  await showCombination(page, { filename: /harbor_lights/ })
  await shot(page, 'viewer-contact-sheet')

  await page.locator('.stage').click({ button: 'right', position: { x: 300, y: 300 } })
  await page.waitForSelector('.menu')
  await shot(page, 'viewer-context-menu')
  await escape(page)

  await page.keyboard.press('p')
  await page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>('.player video')
    return !!v && v.readyState >= 2
  })
  await page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>('.player video')!
    v.pause()
    v.currentTime = 2
  })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  const track = await page.locator('.scrubber').boundingBox()
  if (track) {
    await page.mouse.move(track.x + track.width * 0.6, track.y + track.height / 2)
    await page.waitForSelector('.scrubber__image', { timeout: 8000 }).catch(() => undefined)
    await page.waitForTimeout(300)
  }
  await shot(page, 'viewer-video')
  await page.mouse.move(10, 10)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('p')

  if (await showCombination(page, { filename: /\.avi$/ })) {
    await page.keyboard.press('p')
    await page
      .waitForSelector('text=Can’t Play This Video', { timeout: 10_000 })
      .catch(() => undefined)
    await shot(page, 'viewer-unplayable')
  }
  if (await showCombination(page, { filename: /\.mkv$/ })) {
    await page.keyboard.press('p')
    await page.waitForTimeout(1200)
    await shot(page, 'viewer-mkv')
  }
  if (await showCombination(page, { filename: /damaged_tape/ })) {
    await shot(page, 'viewer-no-contact-sheet')
  }
  if (await showCombination(page, { filename: /night_train/, gallery: 'Empty Gallery' })) {
    await shot(page, 'viewer-empty-gallery')
  }

  await showCombination(page, { filename: /city_at_night/ })
  await page.keyboard.press('Backspace')
  await page.waitForSelector('.toast')
  await shot(page, 'viewer-excluded-toast')
  await page.locator('.toast__action').click()
  await page.waitForFunction(() =>
    document.querySelector('.toast__message')?.textContent?.startsWith('Restored')
  )
  await shot(page, 'viewer-restored-toast')

  await page.evaluate(() => window.pvorg.invoke('setFilters', { tags: ['4k'], cast: ['li_wei'] }))
  await go(page, '#/filters')
  await shot(page, 'filters-required')
  await go(page, '#/')
  await shot(page, 'viewer-no-matching')
  await page.evaluate(() => window.pvorg.invoke('resetFilters'))

  // Filters
  await go(page, '#/filters')
  await shot(page, 'filters')
  await page.locator('.filters .chip').first().click({ button: 'right' })
  await page.waitForSelector('.menu')
  await shot(page, 'filters-chip-menu')
  await escape(page)
  await page.locator('.page-header .search__input').fill('zzz')
  await shot(page, 'filters-no-matches')
  await page.locator('.page-header .search__input').fill('')
  const toggle = page.locator('.filters__preview-toggle')
  if (await toggle.isVisible()) {
    await toggle.click()
    await shot(page, 'filters-preview-hidden')
    await toggle.click()
  }

  // Library
  await go(page, '#/library')
  await shot(page, 'library')
  const card = page.locator('.card__media').nth(1)
  await card.hover()
  await page.waitForSelector('.hover-preview', { timeout: 3000 }).catch(() => undefined)
  await page.waitForTimeout(400)
  await shot(page, 'library-hover-preview')
  await page.mouse.move(5, 5)
  for (const i of [0, 2, 3]) await page.locator('.card__button').nth(i).click()
  await page.mouse.move(5, 5)
  await page.waitForTimeout(250)
  await shot(page, 'library-selected')
  await menu(session, 'deleteSelection')
  await page.waitForSelector('dialog[open]')
  await shot(page, 'library-delete-confirm')
  await escape(page)
  await page.keyboard.press('Escape')
  await page
    .locator('.page-header button:has-text("Sort"), .page-header button:has-text("Title")')
    .first()
    .click()
  await page.waitForSelector('.menu')
  await shot(page, 'library-sort-menu')
  await page.locator('.menu__item:has-text("Quality")').click()
  await page.waitForTimeout(300)
  await shot(page, 'library-sorted-by-quality')
  await page.locator('.page-header button:has-text("Quality")').click()
  await page.locator('.menu__item:has-text("Title")').click()
  await page.locator('.card__button').first().click({ button: 'right' })
  await page.waitForSelector('.menu')
  await shot(page, 'library-card-menu')
  await escape(page)
  await page.locator('button:has-text("Show Files")').click()
  await page.waitForSelector('dialog[open]')
  await shot(page, 'library-skipped-files')
  await page.locator('dialog[open] button:has-text("Done")').click()
  await page.locator('.page-header .search__input').fill('zzz')
  await shot(page, 'library-no-results')
  await page.locator('.page-header .search__input').fill('')
  await page.locator('.card__button').first().click({ button: 'right' })
  await page.locator('.menu__item:has-text("Regenerate Contact Sheet")').click()
  await page.waitForSelector('.card__working', { timeout: 3000 }).catch(() => undefined)
  await shot(page, 'library-regenerating')
  await page.waitForSelector('.toast', { timeout: 30_000 })
  await shot(page, 'library-regenerated-toast')
  await page.mouse.move(5, 5)

  // Gallery Mapping
  await go(page, '#/mapping/galleries')
  await shot(page, 'mapping-galleries')
  await page.locator('.segmented__option:has-text("All")').click()
  await shot(page, 'mapping-galleries-all')
  const cells = page.locator('.matrix__cell-button')
  for (const i of [0, 1, 9, 10, 10]) await cells.nth(i).click()
  await page.mouse.move(5, 5)
  await shot(page, 'mapping-galleries-pending')
  await page.locator('.matrix__column-button').nth(1).click()
  await page.waitForSelector('.menu')
  await shot(page, 'mapping-galleries-column-menu')
  await escape(page)
  await page.locator('.page-header button:has-text("Revert")').click()
  await page.waitForSelector('dialog[open]')
  await shot(page, 'mapping-revert-confirm')
  await page.locator('dialog[open] button:has-text("Discard Changes")').click()
  await page.locator('.page-header .search__input').fill('zzz')
  await shot(page, 'mapping-galleries-no-results')
  await page.locator('.page-header .search__input').fill('')
  await page.locator('.segmented__option:has-text("Undecided")').click()

  // Tag Mapping
  await go(page, '#/mapping/tags')
  await shot(page, 'mapping-tags')
  await page.locator('.page-header button:has-text("Add Tag")').click()
  await page.locator('dialog[open] input').fill('drone, aerial')
  await shot(page, 'mapping-tags-add-dialog')
  await page.locator('dialog[open] button:has-text("Cancel")').click()
  await page.locator('.matrix__column-button').first().click()
  await page.waitForSelector('.menu')
  await shot(page, 'mapping-tags-column-menu')
  await page.locator('.menu__item:has-text("Remove Tag")').click()
  await page.waitForSelector('dialog[open]')
  await shot(page, 'mapping-tags-remove-confirm')
  await page.locator('dialog[open] button:has-text("Cancel")').click()

  // Settings and dialogs
  await go(page, '#/settings')
  await shot(page, 'settings')
  await menu(session, 'cleanup')
  await page.waitForSelector('dialog[open]')
  await shot(page, 'cleanup')
  await page.locator('dialog[open] button:has-text("Cancel")').click()
  await stubOpenDialog(session, path.join(MAIN, 'pvorg.yml'))
  await menu(session, 'import')
  await page.waitForSelector('dialog[open]')
  await shot(page, 'import-preview')
  await page.locator('dialog[open] button:has-text("Cancel")').click()
  await go(page, '#/')
}

async function tourStates(session: Session): Promise<void> {
  const { page } = session

  // Videos without contact sheets, so startup shows its progress every pass.
  rmSync(path.join(RUN, 'fresh', 'videos', 'img'), { recursive: true, force: true })
  await switchLibrary(session, libraries.fresh, false)
  await page.waitForSelector('text=Preparing Previews', { timeout: 30_000 })
  await page.waitForTimeout(600)
  await shot(page, 'startup-progress')
  await ready(page)

  await switchLibrary(session, libraries.broken)
  await shot(page, 'startup-error')

  await switchLibrary(session, libraries.noVideos)
  await go(page, '#/')
  await shot(page, 'viewer-no-videos')
  await go(page, '#/library')
  await shot(page, 'library-no-videos')
  await go(page, '#/mapping/galleries')
  await shot(page, 'mapping-no-videos')
  await menu(session, 'cleanup')
  await page.waitForSelector('dialog[open]')
  await shot(page, 'cleanup-high-risk')
  await page.locator('dialog[open] button:has-text("Cancel")').click()

  await switchLibrary(session, libraries.noGalleries)
  await go(page, '#/')
  await shot(page, 'viewer-no-galleries')
  await go(page, '#/mapping/galleries')
  await shot(page, 'mapping-no-galleries')
  await go(page, '#/mapping/tags')
  await shot(page, 'mapping-no-tags')

  await switchLibrary(session, libraries.allExcluded)
  await go(page, '#/')
  await shot(page, 'viewer-no-combinations')
  await go(page, '#/mapping/galleries')
  await shot(page, 'mapping-all-caught-up')
  await menu(session, 'cleanup')
  await page.waitForSelector('dialog[open]')
  await shot(page, 'cleanup-nothing-to-remove')
  await page.locator('dialog[open] button:has-text("Done")').click()

  await switchLibrary(session, libraries.main)
  await go(page, '#/')
}

async function tourMissingTools(): Promise<void> {
  const session = await launch({ PVORG_TOOLS_PATH: '' })
  try {
    await ready(session.page)
    for (const appearance of APPEARANCES) {
      await setAppearance(session, appearance)
      for (const [w, h] of SIZES) {
        prefix = `${appearance}-${w}x${h}-`
        await resize(session, w, h)
        await go(session.page, '#/library')
        await shot(session.page, 'library-missing-tools')
        await go(session.page, '#/settings')
        await shot(session.page, 'settings-missing-tools')
      }
    }
  } finally {
    await session.app.close()
  }
}

// ---------------------------------------------------------------- checks

async function viewerPosition(
  page: Page
): Promise<{ position: number; total: number; filename: string; gallery: string }> {
  return page.evaluate(async () => {
    const v = await window.pvorg.invoke('viewer')
    return {
      position: v.position,
      total: v.total,
      filename: v.current?.video.filename ?? '',
      gallery: v.current?.gallery.name ?? ''
    }
  })
}

async function checks(session: Session): Promise<void> {
  const { page, app } = session
  await resize(session, 1440, 900)

  await check('security: renderer has no Node globals', async () => {
    const globals = await page.evaluate(() => ({
      require: typeof (window as unknown as Record<string, unknown>).require,
      process: typeof (window as unknown as Record<string, unknown>).process,
      module: typeof (window as unknown as Record<string, unknown>).module,
      Buffer: typeof (window as unknown as Record<string, unknown>).Buffer,
      bridge: Object.keys(window.pvorg).sort().join(',')
    }))
    assert(globals.require === 'undefined', `require is ${globals.require}`)
    assert(globals.process === 'undefined', `process is ${globals.process}`)
    assert(
      globals.module === 'undefined' && globals.Buffer === 'undefined',
      'module/Buffer exposed'
    )
    assert(globals.bridge === 'invoke,onCommand,onStatus', `bridge exposes ${globals.bridge}`)
    return `bridge: ${globals.bridge}`
  })

  await check('security: renderer is sandboxed and context-isolated', async () => {
    const main = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents
      const pid = contents.getOSProcessId()
      const metric = electronApp.getAppMetrics().find((m) => m.pid === pid)
      return { sandboxed: metric?.sandboxed, type: metric?.type, url: contents.getURL() }
    })
    const isolated = await page.evaluate(() => ({
      native: /\[native code\]/.test(Function.prototype.toString.call(window.pvorg.invoke)),
      frozen:
        Object.isFrozen(window.pvorg) || !Object.getOwnPropertyDescriptor(window, 'pvorg')?.writable
    }))
    if (process.platform !== 'linux')
      assert(main.sandboxed === true, `renderer sandboxed: ${main.sandboxed}`)
    assert(
      isolated.native && isolated.frozen,
      `bridge isn’t an isolated proxy: ${JSON.stringify(isolated)}`
    )
    assert(APP || main.url.startsWith('pvorg-app://app/'), `loaded from ${main.url}`)
    return `${main.type} process sandboxed=${main.sandboxed}; bridge is a frozen proxy; ${main.url.split('#')[0]}`
  })

  await check('security: strict Content-Security-Policy on the page', async () => {
    const csp = await page.evaluate(async () =>
      (await fetch('pvorg-app://app/index.html')).headers.get('content-security-policy')
    )
    assert(
      csp && csp.includes("default-src 'none'") && csp.includes("script-src 'self'"),
      `CSP ${csp}`
    )
    expectingErrors = true
    const blocked = await page.evaluate(async () => {
      try {
        await fetch('file:///etc/hosts')
        return false
      } catch {
        return true
      }
    })
    expectingErrors = false
    assert(blocked, 'file:// fetch was allowed')
    return 'file:// blocked'
  })

  await check('security: media protocol refuses paths outside the library', async () => {
    expectingErrors = true
    const statuses = await page.evaluate(async () => {
      const e = encodeURIComponent
      const urls = [
        `pvorg-media://video/${e('../pvorg.json')}`,
        `pvorg-media://video/..%2F..%2F..%2F..%2Fetc%2Fpasswd`,
        `pvorg-media://video/${e('/etc/passwd')}`,
        `pvorg-media://sheet/${e('../../pvorg.json')}`,
        `pvorg-media://gallery/${e('..')}/${e('pvorg.json')}`,
        `pvorg-media://gallery/${e('Beach Days')}/${e('../../pvorg.json')}`,
        `pvorg-media://file/etc/passwd`,
        `pvorg-media://video/${e('not-in-library-video.mp4')}`
      ]
      const out: Record<string, number | string> = {}
      for (const url of urls) {
        try {
          out[url] = (await fetch(url)).status
        } catch (error) {
          out[url] = String(error)
        }
      }
      const v = await window.pvorg.invoke('viewer')
      out.allowed = v.current
        ? (await fetch(v.current.video.videoUrl, { headers: { Range: 'bytes=0-99' } })).status
        : 0
      return out
    })
    expectingErrors = false
    const { allowed, ...refused } = statuses
    for (const [url, status] of Object.entries(refused))
      assert(status === 404, `${url} → ${status}`)
    assert(allowed === 206, `library video → ${allowed}`)
    return `${Object.keys(refused).length} refused with 404; a library video → 206`
  })

  await check('security: IPC rejects unknown methods and unchosen import files', async () => {
    expectingErrors = true
    const errors = await page.evaluate(async () => {
      const out: string[] = []
      for (const call of [
        () => (window.pvorg.invoke as (m: string) => Promise<unknown>)('readFile'),
        () => window.pvorg.invoke('importPreview', '/etc/passwd'),
        () => window.pvorg.invoke('openInDefaultApp', '../../etc/passwd')
      ]) {
        try {
          const value = await call()
          out.push(`resolved ${JSON.stringify(value)}`)
        } catch (error) {
          out.push((error as Error).message)
        }
      }
      return out
    })
    expectingErrors = false
    assert(/Unknown method/.test(errors[0]), errors[0])
    assert(/Choose the file/.test(errors[1]), errors[1])
    assert(errors[2] === 'resolved {"ok":false}', errors[2])
    return errors.join(' | ')
  })

  await check('security: navigation away from the app is blocked', async () => {
    expectingErrors = true
    await page.evaluate(() => {
      location.href = 'file:///etc/hosts'
    })
    await page.waitForTimeout(500)
    expectingErrors = false
    const url = page.url()
    assert(
      url.startsWith('pvorg-app://') || url.startsWith('http://localhost'),
      `navigated to ${url}`
    )
  })

  // Keyboard rules (SPEC §7.1)
  await go(page, '#/library')
  await check('keyboard: letters typed into search reach the field', async () => {
    const search = page.locator('.page-header .search__input')
    await search.click()
    await page.keyboard.type('vcnpb mf')
    const value = await search.inputValue()
    assert(value === 'vcnpb mf', `field has "${value}"`)
    assert((await page.evaluate(() => location.hash)) === '#/library', 'navigated while typing')
    await page.keyboard.press('Escape')
    assert((await search.inputValue()) === 'vcnpb mf', 'Esc cleared the query')
    assert(await page.evaluate(() => document.activeElement?.tagName !== 'INPUT'), 'Esc kept focus')
    await search.fill('')
    await page.keyboard.press('Escape')
    await page.keyboard.press('c')
    await page.waitForTimeout(300)
    assert(
      (await page.evaluate(() => location.hash)) === '#/filters',
      'C didn’t navigate after leaving the field'
    )
    return 'typed “vcnpb mf”; Esc left the field keeping it; C then opened Filters'
  })

  await check('keyboard: viewer keys act on live state, once per press', async () => {
    await page.keyboard.press('v')
    await page.waitForTimeout(300)
    assert((await page.evaluate(() => location.hash)) === '#/', 'V didn’t open the viewer')
    const start = await viewerPosition(page)
    for (let i = 0; i < 3; i++) await page.keyboard.press('n')
    await page.waitForTimeout(400)
    const after = await viewerPosition(page)
    assert(
      after.position === (start.position + 3) % start.total,
      `N×3: ${start.position} → ${after.position}`
    )
    await page.keyboard.press('b')
    await page.waitForTimeout(300)
    const back = await viewerPosition(page)
    assert(back.position === (start.position + 2) % start.total, `B: → ${back.position}`)
    const shown = await page.locator('.page-header__title').innerText()
    const live = await page.evaluate(
      async () => (await window.pvorg.invoke('viewer')).current?.video.title
    )
    assert(shown === live, `header shows “${shown}”, viewer is on “${live}”`)
    return `${start.position + 1} → ${back.position + 1} of ${start.total}`
  })

  await check('keyboard: playback keys only in video mode', async () => {
    await showCombination(page, { filename: /harbor_lights/ })
    await page.keyboard.press(' ')
    assert(
      (await page.locator('.player video').count()) === 0,
      'Space started a video in contact-sheet mode'
    )
    await page.keyboard.press('p')
    await page.waitForFunction(
      () => (document.querySelector<HTMLVideoElement>('.player video')?.readyState ?? 0) >= 2
    )
    await page.evaluate(() => document.querySelector<HTMLVideoElement>('.player video')!.pause())
    const state = () =>
      page.evaluate(() => {
        const v = document.querySelector<HTMLVideoElement>('.player video')!
        return {
          paused: v.paused,
          time: v.currentTime,
          duration: v.duration,
          volume: v.volume,
          muted: v.muted
        }
      })
    await page.keyboard.press('5')
    await page.waitForTimeout(200)
    const jumped = await state()
    assert(
      Math.abs(jumped.time - jumped.duration / 2) < 0.6,
      `5 → ${jumped.time.toFixed(1)} of ${jumped.duration}`
    )
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(150)
    const skipped = await state()
    assert(
      Math.abs(skipped.time - Math.max(0, jumped.time - 10)) < 0.6,
      `← → ${skipped.time.toFixed(1)}`
    )
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('m')
    await page.waitForTimeout(150)
    const sound = await state()
    assert(
      Math.abs(sound.volume - 0.8) < 0.01 && sound.muted,
      `volume ${sound.volume}, muted ${sound.muted}`
    )
    await page.keyboard.press('m')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press(' ')
    await page.waitForTimeout(400)
    assert(!(await state()).paused, 'Space didn’t play')
    await page.keyboard.press(' ')
    await page.keyboard.press('f')
    await page.waitForTimeout(800)
    const full = await page.evaluate(() => !!document.fullscreenElement)
    if (full) {
      await page.keyboard.press('f')
      await page.waitForTimeout(800)
    }
    await page.keyboard.press('p')
    return `jump 50%, skip −10 s, volume 80% + mute, play/pause${full ? ', full screen on/off' : ' (full screen needs a visible window)'}`
  })

  await check('keyboard: shortcuts pause while a dialog is open', async () => {
    await menu(session, 'cleanup')
    await page.waitForSelector('dialog[open]')
    const before = await viewerPosition(page)
    await page.keyboard.press('n')
    await page.keyboard.press('c')
    await page.waitForTimeout(300)
    assert((await viewerPosition(page)).position === before.position, 'N moved behind the dialog')
    assert((await page.evaluate(() => location.hash)) === '#/', 'C navigated behind the dialog')
    await page.locator('dialog[open] button:has-text("Cancel")').click()
  })

  // Exclude Pairing with undo and redo (SPEC §3.6)
  await check('Exclude Pairing: in place, then undo/redo restore pvorg.json exactly', async () => {
    await showCombination(page, { filename: /mountain_pass/ })
    const original = readJson(CONFIG)
    const before = await viewerPosition(page)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(400)
    const after = await viewerPosition(page)
    assert(
      after.total === before.total - 1 && after.position === before.position % after.total,
      'not removed in place'
    )
    const excluded = readJson(CONFIG) as {
      videoRelations: Record<string, { excludedGalleries: string[] }>
    }
    assert(
      excluded.videoRelations[before.filename]?.excludedGalleries.includes(before.gallery),
      'No not written'
    )
    assert((await toastText(page)).startsWith('Excluded'), 'no Exclude message')

    await menu(session, 'undo')
    await page.waitForFunction(() =>
      document.querySelector('.toast__message')?.textContent?.startsWith('Restored')
    )
    assert(
      JSON.stringify(readJson(CONFIG)) === JSON.stringify(original),
      'undo didn’t restore pvorg.json'
    )
    const restored = await viewerPosition(page)
    assert(
      restored.filename === before.filename && restored.gallery === before.gallery,
      'pairing not shown again'
    )
    const message = await toastText(page)
    assert(message === `Restored “${before.gallery}” for “Mountain Pass”`, message)

    await menu(session, 'redo')
    await page.waitForFunction(() =>
      document.querySelector('.toast__message')?.textContent?.startsWith('Excluded')
    )
    assert(
      JSON.stringify(readJson(CONFIG)) !== JSON.stringify(original),
      'redo didn’t exclude again'
    )
    await page.locator('.toast__action').click()
    await page.waitForFunction(() =>
      document.querySelector('.toast__message')?.textContent?.startsWith('Restored')
    )
    assert(
      JSON.stringify(readJson(CONFIG)) === JSON.stringify(original),
      'toast Undo didn’t restore pvorg.json'
    )
    return `“${before.gallery}” × Mountain Pass: excluded, undone (menu), redone (menu), undone (toast)`
  })

  // Delete with confirmation (SPEC §3.7, §6.2)
  await check('delete: confirms with Cancel as the default, then deletes', async () => {
    await go(page, '#/library')
    const name = 'vandelay-john_roe-old_town.mp4'
    const file = path.join(MAIN, 'videos', name)
    await page.locator('.page-header .search__input').fill('Old Town')
    await page.keyboard.press('Escape')
    await page.locator('.card__button').first().click()
    await menu(session, 'deleteSelection')
    await page.waitForSelector('dialog[open]')
    const title = await page.locator('dialog[open] .dialog__title').innerText()
    assert(title === 'Delete “Old Town”?', title)
    const focused = await page.evaluate(() => document.activeElement?.textContent)
    assert(focused === 'Cancel', `default button is ${focused}`)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    assert(existsSync(file) && !(await page.locator('dialog[open]').count()), 'Enter deleted')
    await menu(session, 'deleteSelection')
    await page.locator('dialog[open] .btn--danger').click()
    await page.waitForFunction(() =>
      document.querySelector('.toast__message')?.textContent?.startsWith('Deleted')
    )
    assert(!existsSync(file), 'file still there')
    assert(
      !existsSync(path.join(MAIN, 'videos', 'img', `${name}.jpg`)),
      'contact sheet still there'
    )
    await page.locator('.page-header .search__input').fill('')
    return `${await toastText(page)}`
  })

  // Mapping save (SPEC §3.3)
  await check('mapping: a cell change saves with the menu’s Save', async () => {
    await go(page, '#/mapping/galleries')
    await page.locator('.segmented__option:has-text("All")').click()
    await page.locator('.page-header .search__input').fill('Skyline')
    await page.keyboard.press('Escape')
    const cell = page.locator('.matrix__cell-button[aria-label="Skyline, Wildlife"]')
    await cell.click()
    await cell.click()
    const badge = await page
      .locator('.sidebar .nav__link[href="#/mapping/galleries"] .nav__badge')
      .innerText()
    assert(badge === '1', `badge ${badge}`)
    await menu(session, 'save')
    await page.waitForFunction(
      () => document.querySelector('.toast__message')?.textContent === 'Saved 1 change'
    )
    const relation = (
      readJson(CONFIG) as { videoRelations: Record<string, Record<string, string[]>> }
    ).videoRelations['acme-sam_lee-skyline.mp4']
    assert(relation?.excludedGalleries.includes('Wildlife'), JSON.stringify(relation))
    assert(relation.galleries.length === 0 && relation.tags.length === 0, 'other arrays changed')
    await page.locator('.page-header .search__input').fill('')
    await page.locator('.segmented__option:has-text("Undecided")').click()
    return 'Skyline × Wildlife → No'
  })

  // Tag vocabulary (SPEC §3.9)
  await check('tags: add (comma-separated, case-insensitive skip) and remove', async () => {
    await go(page, '#/mapping/tags')
    await page.locator('.page-header button:has-text("Add Tag")').click()
    await page.locator('dialog[open] input').fill(' aerial , NIGHT, Drone ')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.toast')
    let tags = (readJson(CONFIG) as { tags: string[] }).tags
    assert(tags.includes('aerial') && tags.includes('Drone'), `tags ${tags}`)
    assert(!tags.includes('NIGHT'), 'NIGHT added though night exists')
    const message = await toastText(page)
    await page.locator('.matrix__column-button:has-text("aerial")').click()
    await page.locator('.menu__item:has-text("Remove Tag")').click()
    await page.waitForSelector('dialog[open]')
    await page.locator('dialog[open] .btn--danger').click()
    await page.waitForFunction(() =>
      document.querySelector('.toast__message')?.textContent?.startsWith('Removed')
    )
    tags = (readJson(CONFIG) as { tags: string[] }).tags
    assert(!tags.includes('aerial'), 'aerial still there')
    return `${message}; removed “aerial”`
  })

  // Import (SPEC §3.10)
  await check('import: preview, then apply, then nothing new', async () => {
    await stubOpenDialog(session, path.join(MAIN, 'pvorg.yml'))
    await menu(session, 'import')
    await page.waitForSelector('dialog[open]')
    const summary = await page.locator('dialog[open] .summary-grid').innerText()
    assert(/Videos matched\s+3 of 4/.test(summary), summary)
    assert(/Galleries matched\s+4 of 5/.test(summary), summary)
    const button = page.locator('dialog[open] .btn--primary')
    const label = await button.innerText()
    await button.click()
    await page.waitForFunction(() =>
      document.querySelector('.toast__message')?.textContent?.startsWith('Imported')
    )
    const config = readJson(CONFIG) as {
      tags: string[]
      videoRelations: Record<string, Record<string, string[]>>
    }
    const city = config.videoRelations['acme-alex_kim-city_at_night.mp4']
    assert(
      city.galleries.includes('City Lights') && city.galleries.includes('Portraits'),
      JSON.stringify(city)
    )
    assert(
      city.excludedGalleries.includes('Beach Days') && city.excludedGalleries.includes('Wildlife'),
      JSON.stringify(city)
    )
    assert(city.tags.includes('night'), 'Night didn’t map to the existing night tag')
    const harbor = config.videoRelations['acme-jane_doe-harbor_lights.mp4']
    assert(harbor.galleries.includes('Beach Days'), 'existing decision changed')
    const toast = await toastText(page)
    await stubOpenDialog(session, path.join(MAIN, 'pvorg.yml'))
    await menu(session, 'import')
    await page.waitForSelector('dialog[open]')
    const again = await page.locator('dialog[open] .dialog__title').innerText()
    assert(again === 'Nothing New to Import', again)
    await page.locator('dialog[open] button:has-text("Done")').click()
    return `${label} → ${toast}`
  })

  await check('no console errors', async () => {
    assert(
      consoleErrors.length === 0,
      `${consoleErrors.length}: ${consoleErrors.slice(0, 3).join(' | ')}`
    )
  })
}

// ---------------------------------------------------------------- run

async function main(): Promise<void> {
  prepare()
  const started = Date.now()
  if (MODE === 'smoke') {
    const session = await launch()
    try {
      await ready(session.page)
      await check('packaged app launches and loads the library', async () => {
        const title = await session.page.locator('.page-header__title').innerText()
        return `viewer shows “${title}”`
      })
      prefix = 'packaged-'
      await shot(session.page, 'viewer')
      await checks(session)
    } finally {
      await session.app.close()
    }
  } else {
    const session = await launch()
    try {
      await ready(session.page)
      for (const appearance of APPEARANCES) {
        await setAppearance(session, appearance)
        for (const [w, h] of SIZES) {
          prefix = `${appearance}-${w}x${h}-`
          await resize(session, w, h)
          await tourMain(session)
          await tourStates(session)
        }
      }
      await setAppearance(session, 'dark')
      await checks(session)
    } finally {
      await session.app.close()
    }
    await tourMissingTools()
  }
  const failed = results.filter((r) => !r.ok)
  const lines = [
    `pvorg desktop tour — ${new Date().toISOString()} — ${MODE}`,
    `${shots.length} screenshots in ${OUT}`,
    `${results.length - failed.length} passed, ${failed.length} failed, ${Math.round((Date.now() - started) / 1000)} s`,
    '',
    ...results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`),
    ...(consoleErrors.length ? ['', 'Console errors:', ...consoleErrors] : [])
  ]
  writeFileSync(path.join(OUT, 'results.txt'), lines.join('\n') + '\n')
  console.log(`\n${lines.slice(0, 3).join('\n')}`)
  process.exitCode = failed.length ? 1 : 0
}

await main()
