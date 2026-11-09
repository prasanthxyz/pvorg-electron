/** App preferences in `<userData>/settings.json`: appearance, the chosen library file, the sidebar. */

import { promises as fs, readFileSync } from 'fs'
import * as path from 'path'
import { atomicWriteFile, defaultConfigPath, serializeJson } from './library/config'
import type { Appearance, ConfigSource } from '../shared/types'

export interface Preferences {
  appearance: Appearance
  /** A pvorg.json chosen in Settings, remembered across launches. */
  libraryFile: string | null
  /** The sidebar was hidden (SPEC §4.1); shown is the default. */
  sidebarHidden: boolean
}

const DEFAULTS: Preferences = { appearance: 'dark', libraryFile: null, sidebarHidden: false }

export class SettingsStore {
  private value: Preferences

  constructor(private readonly file: string) {
    this.value = SettingsStore.read(file)
  }

  private static read(file: string): Preferences {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      return {
        appearance: ['system', 'light', 'dark'].includes(data.appearance)
          ? data.appearance
          : DEFAULTS.appearance,
        libraryFile:
          typeof data.libraryFile === 'string' && path.isAbsolute(data.libraryFile)
            ? data.libraryFile
            : null,
        sidebarHidden: data.sidebarHidden === true
      }
    } catch {
      return { ...DEFAULTS }
    }
  }

  get(): Preferences {
    return { ...this.value }
  }

  async update(patch: Partial<Preferences>): Promise<Preferences> {
    this.value = { ...this.value, ...patch }
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    await atomicWriteFile(this.file, serializeJson(this.value))
    return this.get()
  }

  /** A file chosen in Settings wins, then PVORG_CONFIG, then ~/pvorg.json (SPEC §1.1). */
  configPath(env: NodeJS.ProcessEnv = process.env): { file: string; source: ConfigSource } {
    if (this.value.libraryFile) return { file: this.value.libraryFile, source: 'settings' }
    if (env.PVORG_CONFIG) return { file: defaultConfigPath(env), source: 'environment' }
    return { file: defaultConfigPath(env), source: 'default' }
  }
}
