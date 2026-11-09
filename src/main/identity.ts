/** The app's names (SPEC §4.2) and where it keeps its own data. */

import * as path from 'path'

/** The name users see: windows, menus, the Dock, installers, messages. */
export const APP_NAME = 'PP Video Organizer'

/** The technical name: library files, identifiers, executables, the settings folder. */
export const TECHNICAL_NAME = 'pvorg'

/**
 * The folder for the app's settings, chosen library file, appearance, sidebar and thumbnail
 * cache. It's pinned to the technical name, which is where every earlier version kept them
 * (Electron's default is `<appData>/<package.json name>`), so renaming the app never moves
 * them. `PVORG_USER_DATA` points QA runs elsewhere.
 */
export function userDataFolder(appData: string, env: NodeJS.ProcessEnv = process.env): string {
  return env.PVORG_USER_DATA
    ? path.resolve(env.PVORG_USER_DATA)
    : path.join(appData, TECHNICAL_NAME)
}
