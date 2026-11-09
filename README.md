# PP-Video-Organizer

The desktop app of pvorg (Personal Video + Gallery Organizer) for macOS, Windows
and Linux, built with Electron, React and TypeScript.

**What the app does and how it should look and behave is defined in
[docs/SPEC.md](docs/SPEC.md)**, the product spec shared with pvorg-native,
pvorg-web and pvorg-android. This README covers building, running and developer
tooling only.

## Requirements

- Node.js 22.12 or later
- `ffmpeg` and `ffprobe` in `PATH`, for contact sheets and video details
  (Homebrew's and the usual package-manager folders are searched too). Without
  them the library still loads, and the app says which tool is missing.
- A library file, `pvorg.json` (see the spec, §1). The app looks for
  `~/pvorg.json`, or the file named by `PVORG_CONFIG`; **Settings › Choose
  Library File…** picks another one and remembers it. pvorg never creates the
  file. A library from the app's earlier versions (`~/pvorg.yml`) can be merged
  in with **File › Import from pvorg.yml…**.

## Develop

```bash
npm install
npm run dev          # electron-vite with hot reload
```

npm 11 blocks dependency install scripts by default. Electron downloads its
binary on first use; if that fails, run `node node_modules/electron/install.js`.

| Command             | Purpose                                                         |
| ------------------- | --------------------------------------------------------------- |
| `npm run typecheck` | Type-check the main process, preload, renderer and QA scripts   |
| `npm run lint`      | ESLint                                                          |
| `npm test`          | Unit tests (Vitest) for the library rules in `src/main/library` |
| `npm run build`     | Type-check and build into `out/`                                |
| `npm start`         | Run the built app                                               |

## Package

```bash
npm run build:unpack   # unpacked app in dist/ (quick check)
npm run build:mac      # .dmg
npm run build:win      # NSIS installer
npm run build:linux    # AppImage and .deb
```

Builds are unsigned. Auto-update isn't configured: the app has no release
channel to update from.

## Visual QA

| Tool                                                        | Purpose                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run fixture`                                           | Builds a synthetic library with ffmpeg in `/tmp/pvorg-desktop-fixture` (`scripts/make-fixture.sh <dir>` for another folder): 21 valid videos, an .mkv, an .avi and a damaged file, two badly named files, eight galleries plus an empty one, stale entries and an old `pvorg.yml`.                                     |
| `npm run tour`                                              | After `npm run build`: launches the real app with Playwright against a copy of the fixture, screenshots every page and state in Dark and Light at 1440×900 and 960×600 into `/tmp/pvorg-desktop-tour`, runs the keyboard, Exclude Pairing, delete, mapping, tag, import and security checks, and writes `results.txt`. |
| `PVORG_TOUR_MODE=smoke PVORG_APP=<executable> npm run tour` | The same checks against a packaged build.                                                                                                                                                                                                                                                                              |

Environment variables for QA runs:

| Variable                                     | Effect                                                            |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `PVORG_CONFIG`                               | Library file to open (a file chosen in Settings takes precedence) |
| `PVORG_USER_DATA`                            | Folder for the app's own settings and thumbnail cache             |
| `PVORG_TOOLS_PATH`                           | Search only these folders for ffmpeg and ffprobe                  |
| `PVORG_HIDE_WINDOW=1`                        | Don't show the window (screenshots still work)                    |
| `PVORG_TOUR_APPEARANCES`, `PVORG_TOUR_SIZES` | Narrow a tour, e.g. `dark` and `1440x900`                         |

## Project layout

- `src/main/library`: the spec's Part I in TypeScript — `pvorg.json`, scanning,
  combinations, mapping saves, Exclude Pairing, deletion, stale and orphan
  cleanup, tag vocabulary, the `pvorg.yml` importer, ffmpeg previews
- `src/main`: app lifecycle and window security, IPC handlers, the native menu,
  the `pvorg-app:` and `pvorg-media:` protocols, thumbnails, preferences
- `src/preload`: the typed bridge (`window.pvorg`)
- `src/shared`: the IPC API and payload types
- `src/renderer`: the React UI (pages, components, design tokens)
- `test`: unit tests, including the shared compatibility sequence
- `qa`, `scripts`: the Playwright tour and the fixture generator
- `docs/SPEC.md`: the shared product spec
