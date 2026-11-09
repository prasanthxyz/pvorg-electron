import { readFileSync, writeFileSync } from 'fs'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
import { APP_NAME, userDataFolder } from '../src/main/identity'
import { SettingsStore } from '../src/main/settings'
import { scratch } from './helpers'

describe('app name and data folder (§4.2)', () => {
  it('shows PP Video Organizer', () => {
    expect(APP_NAME).toBe('PP Video Organizer')
  })

  it('keeps settings in <appData>/pvorg whatever the app is called', () => {
    const appData = path.join(scratch(), 'Application Support')
    expect(userDataFolder(appData, {})).toBe(path.join(appData, 'pvorg'))
    expect(userDataFolder(appData, { PVORG_USER_DATA: '' })).toBe(path.join(appData, 'pvorg'))
  })

  it('uses PVORG_USER_DATA when set', () => {
    const dir = scratch()
    expect(userDataFolder('/elsewhere', { PVORG_USER_DATA: dir })).toBe(path.resolve(dir))
  })
})

describe('preferences', () => {
  it('shows the sidebar by default and remembers hiding it (§4.1)', async () => {
    const file = path.join(scratch(), 'settings.json')
    expect(new SettingsStore(file).get().sidebarHidden).toBe(false)
    await new SettingsStore(file).update({ sidebarHidden: true })
    expect(new SettingsStore(file).get().sidebarHidden).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8')).sidebarHidden).toBe(true)
  })

  it('reads settings saved before the sidebar could be hidden', () => {
    const file = path.join(scratch(), 'settings.json')
    writeFileSync(file, JSON.stringify({ appearance: 'light', libraryFile: '/a/pvorg.json' }))
    expect(new SettingsStore(file).get()).toEqual({
      appearance: 'light',
      libraryFile: '/a/pvorg.json',
      sidebarHidden: false
    })
  })

  it('ignores a sidebar value that isn’t true', () => {
    const file = path.join(scratch(), 'settings.json')
    writeFileSync(file, JSON.stringify({ sidebarHidden: 'yes' }))
    expect(new SettingsStore(file).get().sidebarHidden).toBe(false)
  })
})
