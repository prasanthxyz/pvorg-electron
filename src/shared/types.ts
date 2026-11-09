/** Payloads shared by the main process and the renderer. */

export type Phase = 'loading' | 'ready' | 'error'
export type Appearance = 'system' | 'light' | 'dark'
export type Platform = 'darwin' | 'win32' | 'linux'

export interface AppInfo {
  platform: Platform
  version: string
  name: string
}

export interface Status {
  phase: Phase
  step: string
  detail: string | null
  fraction: number | null
  error: string | null
  missingTools: string[]
  configPath: string
  configExists: boolean
  revision: number
  library: { videos: number; galleries: number }
}

export type ConfigSource = 'settings' | 'environment' | 'default'

export interface Settings {
  configPath: string
  configSource: ConfigSource
  configExists: boolean
  videosPath: string | null
  galleriesPath: string | null
  appearance: Appearance
  sidebarHidden: boolean
  tools: { ffmpeg: string | null; ffprobe: string | null }
}

export type EmptyReason = 'noVideos' | 'noGalleries' | 'filters' | 'mappings'

export interface ViewerCombination {
  video: {
    filename: string
    title: string
    credits: string
    extension: string
    sheetUrl: string | null
    videoUrl: string
  }
  gallery: { name: string; images: string[] }
}

export interface ViewerState {
  position: number
  total: number
  revision: number
  current: ViewerCombination | null
  nextSheetUrl: string | null
  empty: {
    reason: EmptyReason
    videosPath: string
    galleriesPath: string
    tagsRequired: boolean
  } | null
}

export type FilterKey = 'galleries' | 'studios' | 'tags' | 'cast'

export interface FilterItem {
  value: string
  label: string
}

export interface FiltersState {
  sections: Record<FilterKey, { items: FilterItem[]; selected: string[] }>
  isDefault: boolean
  count: number
  videoCount: number
  galleryCount: number
  upNext: { index: number; title: string; gallery: string; thumbUrl: string | null }[]
  revision: number
}

export interface VideoDetails {
  /** Seconds. */
  duration: number
  width: number
  height: number
  fps: number
  /** Bytes. */
  fileSize: number
  /** Normalized bitrate in Mbps, or null. */
  quality: number | null
}

export interface VideoSummary {
  filename: string
  title: string
  credits: string
  studio: string
  actors: string[]
  thumbUrl: string | null
  previewUrl: string | null
  details: VideoDetails | null
  regenerating: boolean
}

export interface SkippedFile {
  filename: string
  reasons: string[]
}

export interface LibraryState {
  videos: VideoSummary[]
  skipped: SkippedFile[]
  videosPath: string
  missingTools: string[]
  revision: number
}

export type MappingKind = 'galleries' | 'tags'
export type TriState = 'yes' | 'no' | 'undecided'

export interface MappingRow extends VideoSummary {
  /** One character per column: y, n or u. */
  states: string
}

export interface MappingState {
  kind: MappingKind
  columns: string[]
  rows: MappingRow[]
  galleriesPath: string
  configPath: string
  revision: number
}

export interface CleanupPreview {
  videosPath: string
  videoFileCount: number
  relationCount: number
  staleEntries: string[]
  highRisk: boolean
}

export interface ImportPreview {
  file: string
  matchedVideos: {
    filename: string
    title: string
    galleriesYes: number
    galleriesNo: number
    tags: string[]
  }[]
  unmatchedVideos: { path: string; reason: string }[]
  matchedGalleries: string[]
  unmatchedGalleries: string[]
  tagsToAdd: string[]
  decisionCount: number
  keptCount: number
}

export type RevealTarget =
  | { kind: 'config' }
  | { kind: 'videos' }
  | { kind: 'galleries' }
  | { kind: 'video'; filename: string }
  | { kind: 'gallery'; name: string }

/** Menu commands sent from the application menu to the renderer. */
export type Command =
  | { type: 'navigate'; path: string }
  | {
      type:
        | 'reload'
        | 'cleanup'
        | 'import'
        | 'chooseLibrary'
        | 'undo'
        | 'redo'
        | 'selectAll'
        | 'deselectAll'
        | 'deleteSelection'
        | 'find'
        | 'save'
        | 'revert'
        | 'toggleMode'
        | 'previous'
        | 'next'
        | 'exclude'
        | 'playPause'
        | 'skipBack'
        | 'skipForward'
        | 'volumeUp'
        | 'volumeDown'
        | 'mute'
        | 'fullScreen'
        | 'addTag'
        | 'toggleSidebar'
        | 'settingsChanged'
    }
  | { type: 'jump'; tenth: number }

export type Page = 'viewer' | 'filters' | 'library' | 'galleries' | 'tags' | 'settings' | 'other'

/** What the renderer tells the menu, so items enable only when they apply. */
export interface MenuState {
  ready: boolean
  page: Page
  hasCombination: boolean
  videoMode: boolean
  canUndo: string | null
  canRedo: string | null
  hasSelection: boolean
  hasVideos: boolean
  pendingChanges: number
  /** The sidebar can be hidden: false while navigation is the narrow-window drawer. */
  sidebarToggle: boolean
}
