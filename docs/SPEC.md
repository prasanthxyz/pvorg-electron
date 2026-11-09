# pvorg — Product Specification

> **One spec, four apps.** This file is shared, unchanged, by
> **pvorg-native** (macOS), **pvorg-web**, **pvorg-android** and
> **PP-Video-Organizer** (Electron desktop for macOS, Windows and Linux), at
> `docs/SPEC.md` in each repository. When behavior or design changes, edit it
> in one repository and copy it to the other three in the same change. The
> version line below identifies the copy.
>
> **Version 1.2 · 2026-11-09**

pvorg (Personal Video + Gallery Organizer) is a single-user tool for browsing
a personal library of videos paired with image galleries. It shows one
**combination** (a video plus a gallery) at a time: the video's contact sheet
or the video itself, beside a slideshow of the gallery. Around that viewer are
tools to narrow which combinations appear, to decide which galleries and tags
belong to which videos, and to remove unwanted videos.

The spec has four parts:

- **Part I — Data and rules** must behave identically on every platform. They
  define what a library is and what every operation does to it.
- **Part II — Experience** defines the pages, their content, states and
  commands. Every app has the same pages with the same names and behavior;
  presentation follows each platform's conventions.
- **Part III — Design** defines the design language, tokens, components and
  the quality bar, plus the decision log explaining why.
- **Part IV — Platforms** says how each app maps the experience onto its
  platform, what it can't do, and how it is verified.

"Must" marks requirements; "should" marks strong defaults that a platform may
deviate from with a recorded reason (§18). Features marked **optional** (§6.8)
follow their rules wherever an app offers them; §17 records which apps do.

---

# Part I — Data and rules

## 1. Library on disk

A library is a folder of videos, a folder of gallery subfolders, and a
configuration file, `pvorg.json`.

### 1.1 Where the library lives

| Platform | Configuration | Videos | Galleries |
|---|---|---|---|
| macOS | `~/pvorg.json`, or the file named by `PVORG_CONFIG` | `videosPath` in the config | `galleriesPath` in the config |
| Desktop (Electron) | Same as macOS; a file chosen in Settings takes precedence over `PVORG_CONFIG` and is remembered until **Use Default** | `videosPath` | `galleriesPath` |
| Web | Same as macOS, read and written by the server | `videosPath` | `galleriesPath` |
| Android | `pvorg.json` in a root folder the user picks (Storage Access Framework) | `<root>/VID` | `<root>/GAL` |

On Android, `videosPath` and `galleriesPath` are optional and ignored, so one
library folder can be copied between a computer and a tablet unchanged.
`VID/img` may be absent; every video then shows the No Contact Sheet state.
Everything else in this section is identical on all platforms.

### 1.2 `pvorg.json`

```json
{
  "videosPath": "/Volumes/Media/videos",
  "galleriesPath": "/Volumes/Media/galleries",
  "tags": ["4k", "outdoor", "travel"],
  "videoRelations": {
    "acme-jane_doe-harbor_lights.mp4": {
      "galleries": ["Beach Days"],
      "excludedGalleries": ["Portraits"],
      "tags": ["outdoor"],
      "excludedTags": ["4k"]
    }
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `videosPath` | string, required on desktop | Folder of video files. Optional and ignored on Android. |
| `galleriesPath` | string, required on desktop | Folder whose subfolders are galleries. Optional and ignored on Android. |
| `tags` | string array, required | The tag vocabulary for filtering and Tag Mapping. |
| `videoRelations` | object, required | Per-video decisions, keyed by the exact video filename. |

Each relation has four optional string arrays, which together record a
**tri-state** decision per gallery and per tag:

| State | Gallery | Tag |
|---|---|---|
| **Yes** | listed in `galleries` | listed in `tags` |
| **No** | listed in `excludedGalleries` | listed in `excludedTags` |
| **Undecided** | in neither list | in neither list |

A video is **fully decided** for galleries (or tags) when every gallery (or
tag) is Yes or No.

Rules for reading and writing:

- **Missing entry.** A video without an entry behaves as Undecided for
  everything. No entry is created just because a video exists.
- **Normalization at startup.** Missing or `null` arrays in existing entries
  become `[]`, and the file is saved only if something changed. Empty arrays
  are meaningful and kept.
- **Unknown values are preserved.** Saving decisions for known galleries or
  tags must keep values the app doesn't recognize, such as a gallery folder
  that no longer exists. Saving galleries must not change tags, and vice versa.
- **Writing.** UTF-8 JSON, pretty-printed, keys sorted, trailing newline,
  written atomically (write a temporary file, then rename). Exact whitespace
  may differ between platforms; content may not.
- **Unknown keys.** Keys outside this schema are not preserved by any
  implementation. Don't keep other data in `pvorg.json`.

### 1.3 Video filenames

Videos are named `studio-cast-…-title.ext`:

- lowercase, no spaces, at least three dash-separated parts;
- the first part is the **studio**, the last is the **title**, and every part
  in between is a **cast** member;
- extensions: `mp4`, `mkv`, `avi`, `mov`, `wmv`, `webm` (case-insensitive);
- hidden files (leading `.`) are ignored.

Files that break the convention are **skipped**, not loaded, and every app
must show which files were skipped and why (§6.3).

Example: `acme-jane_doe-john_roe-mountain_pass.mp4` → studio `acme`, cast
`jane_doe` and `john_roe`, title `mountain_pass`.

### 1.4 Galleries

A gallery is a subfolder of the galleries folder. Its `png`, `jpg`, `jpeg`,
`bmp` and `gif` files (case-insensitive, hidden files ignored) are its images,
sorted by filename. The gallery's name is the folder name, shown as-is.

### 1.5 Generated assets

| Asset | Path | Written by | Read by |
|---|---|---|---|
| Contact sheet: 4×4 grid of frames at evenly spaced times, 1920 px wide JPEG | `<videos>/img/<video filename>.jpg` | macOS, Desktop, Web, scripts | all |
| Metadata cache: `{ "<filename>": { "duration", "width", "height", "fps", "file_size" } }` (duration in seconds, size in bytes) | `<videos>/cache.json` | macOS, Desktop, Web, scripts | all |
| Seek-preview sprite sheet and WebVTT index | `<videos>/sprite/<video filename>_sprite.jpg` and `.vtt` | Web, scripts | Web |

Assets from one platform must never break another. Each platform cleans up
only the asset folders it writes (orphan cleanup, §3.4). A video's assets are
removed together with the video when it is deleted (§3.7).

---

## 2. Presentation rules

- **Display names.** Studio, cast and title are shown humanized:
  underscores become spaces and each word is capitalized (`jane_doe` →
  "Jane Doe"). Gallery and tag names are shown exactly as written. Raw values
  remain the identifiers everywhere else.
- **Credits** read "Studio · Cast": the humanized studio, a middle dot, and
  the cast joined with the platform's list formatting ("Jane Doe and John
  Roe").
- **Sorting.** Video lists sort by humanized title (case-insensitive,
  locale-aware), then filename. Chip lists sort by displayed name.
- **Search** matches the humanized title, filename, humanized studio and
  humanized cast, ignoring case and diacritics. Filter-chip search matches the
  displayed name.
- **Counts** use the platform's number formatting and correct plurals ("1
  video", "3 videos").
- **Timecodes** are `m:ss`, or `h:mm:ss` from one hour.
- **Quality score** (optional, §6.8): the video's average bitrate,
  `file_size × 8 / duration`, normalized to 640 × 480 at 30 fps:
  `bitrate ÷ (width × height ÷ 307200) ÷ (fps ÷ 30)`, shown in Mbps with one
  decimal. It compares compression quality independently of resolution;
  resolution is shown separately. Videos without metadata have no score.

---

## 3. Operations

### 3.1 Combinations and filters

A combination pairs one video with one gallery. It is included when **all** of
these hold:

1. the gallery is **included** in Filters;
2. the video isn't **excluded** from that gallery (Yes and Undecided both
   count as belonging);
3. the video's studio is **included** in Filters;
4. the video is **Yes for every required tag**. With no tags required (the
   default) there is no tag filter, and tagged and untagged videos alike
   appear;
5. the video features **every required cast member**.

Galleries and tags deliberately work in opposite directions:

- **Galleries are opt-out.** A video pairs with every gallery unless it is
  excluded, so all galleries start included, and including several galleries
  shows each video with *any* of them.
- **Tags are opt-in.** A video has a tag only when it is explicitly Yes;
  Undecided and No both mean it doesn't. Requiring several tags needs *all*
  of them.

Filter defaults: every gallery and every studio included, no tags or cast
required. The list is shuffled whenever it is regenerated: on every filter
change and every reload. Regenerating starts from the first combination.

### 3.2 Startup and reload

On launch and on **Reload Library**, behind a progress screen:

1. **Loading Configuration**: read and validate `pvorg.json`.
2. **Scanning Library**: list galleries and videos, validating filenames.
3. **Updating pvorg.json**: normalize relations (§1.2).
4. **Cleaning Up Previews**: remove orphaned assets (§3.4).
5. **Preparing Previews**: for each video, generate a missing contact sheet
   and missing metadata. Progress is determinate and names the current file
   ("6 of 22 · filename").

Reload resets filters to their defaults. Unsaved mapping changes survive a
reload, except for videos that no longer exist. A failure shows the error
screen (§6.7). Only one startup run may be in progress at a time.

Platforms that can't generate previews (Android) skip step 5. Videos without a
contact sheet are still part of the library; they show the "No Contact
Sheet" state. If `ffmpeg` or `ffprobe` isn't available, step 5 is skipped
too, and a warning callout names the missing tool (optional, §6.8); the
library still loads.

### 3.3 Mapping saves

Saving Gallery or Tag Mapping applies every pending cell change in one atomic
write:

- **Yes** adds the name to the yes-list and removes it from the no-list.
- **No** does the reverse.
- **Undecided** removes it from both.
- Known names are written in vocabulary order. Unknown values already present
  are kept after them (§1.2).
- A relation created by a save has all four arrays; the other pair is `[]`.

After saving, the library is rescanned and the combination list regenerated.

### 3.4 Orphaned assets

At startup, delete contact sheets (and, on Web, sprite files) whose video no
longer exists among the valid videos. Never delete anything else.

### 3.5 Stale entries

**Clean Up Stale Entries** removes `videoRelations` entries whose video file
is no longer on disk. It touches only `pvorg.json`.

- It always shows a preview first: videos folder, videos on disk, entries in
  `pvorg.json`, and the entries that would be removed.
- **High risk:** if no videos are visible on disk while entries exist (a
  disconnected drive, say), the preview shows a critical warning, and the
  remove action must not be the default action.
- With nothing to remove, the preview says so and offers only "Done".

### 3.6 Exclude Pairing

Excluding the current pairing, from the viewer, records that this gallery
should never be paired with this video:

- It writes No for that gallery to the video's relation, exactly as setting
  the cell to No in Gallery Mapping and saving would. Any unsaved Gallery
  Mapping edit of that cell is discarded.
- It removes only that pairing from the combination list, **without
  reshuffling**. The next combination takes its place and the position stays
  the same; at the end of the list it wraps to the first.
- No files are touched, and the video keeps every other gallery.
- **No confirmation.** It must be undoable: an Undo action in the
  confirmation message, plus the platform's standard undo and redo where one
  exists.
- **Undo** restores the previous decision exactly (Yes or Undecided). If the
  exclusion created the video's entry and nothing else has been decided for
  it since, undo removes the entry again, so `pvorg.json` returns to the same
  content (formatting is always the canonical format of §1.2). If the
  current filters still allow the pairing, undo puts it back at its old
  position and shows it.
- **Feedback.** Undoing by any route replaces the Exclude message with a brief
  "Restored "Gallery" for "Title"" confirmation, so a stale Undo never lingers.
  Redo shows the Exclude message again.

### 3.7 Deleting videos

Deletion is **permanent** (not moved to the trash) and always confirmed. For
each selected video it removes the video file, its contact sheet (and, on Web,
its sprite files), its `videoRelations` entry and its `cache.json` entry. Only
filenames from the scanned library are accepted. Afterwards the library is
rescanned and filters reset.

- If a video file can't be deleted, its relation and cache entry are **kept**
  (the video is still there) and the failure is listed.
- A missing contact sheet is not an error. One that can't be removed is listed
  and is cleaned up as an orphan at the next startup.

### 3.8 Library selection

The selection only ever contains videos that are currently shown. Searching
drops hidden videos from it, so Delete can never remove something a search is
hiding. Select All selects every video shown, which means every match when
searching.

### 3.9 Tag vocabulary (optional)

- **Adding tags** appends names to `tags`. Names are trimmed, several may be
  added at once separated by commas, and a name that matches an existing tag
  ignoring case is skipped.
- **Removing a tag** always confirms, naming how many videos have a decision
  for it. It removes the name from `tags` and from every relation's `tags` and
  `excludedTags`, drops pending Tag Mapping changes for it, and removes it
  from the required tags in Filters.
- Both are single atomic writes (§1.2), followed by a rescan.

### 3.10 Importing from pvorg.yml (optional)

The Electron app's earlier versions stored their library in `~/pvorg.yml`:
lists of video file paths, gallery folder paths and tag names, plus explicit
video–gallery and video–tag pairs. Every new video was paired with every
gallery, so a missing pair meant the pairing had been removed. Import merges
that file into `pvorg.json`:

- **Preview first.** It lists the videos matched in the library (same
  filename inside the videos folder, valid per §1.3), the videos not found
  there, galleries matched by folder name, tags to add, and the number of
  decisions to write. Nothing is written until the user confirms.
- **Mapping.** For each matched video and matched gallery, a pair → Yes, no
  pair → No. Each video–tag pair → Yes for that tag; other tags stay
  Undecided. Tag names match the vocabulary ignoring case, keeping the
  existing spelling; unknown names are added to it. A video listed more than
  once, or only in pairs, is merged into one entry by filename.
- **Existing decisions win.** Only Undecided cells are filled; no Yes or No
  already in `pvorg.json` changes.
- It never moves, copies or deletes files, and it is one atomic write
  followed by a rescan.

---

# Part II — Experience

## 4. Information architecture

Every app has the same pages, with the same names, in two groups:

| Group | Page | Purpose |
|---|---|---|
| Browse | **Viewer** | Browse combinations one at a time. The landing page. |
| Browse | **Filters** | Choose which combinations the viewer shows. |
| Organize | **Library** | All videos: review, search, select and delete. |
| Organize | **Gallery Mapping** | Decide which galleries each video belongs with. |
| Organize | **Tag Mapping** | Decide which tags each video has. |
| — | **Settings** | Appearance and library location. |

- Primary navigation is always visible on large screens and lists the pages
  with icons and labels, grouped as above.
- Gallery Mapping and Tag Mapping show a **badge** with their count of unsaved
  changes.
- A **library summary** ("22 videos · 9 galleries") sits at the foot of the
  navigation.
- Each page has a header with the page title (or, in the viewer, the current
  video) and a subtitle carrying its key count or status.
- Page-specific actions live in that header; global actions (Reload Library,
  Clean Up Stale Entries, Settings) live in the app menu or overflow menu.

Navigation icons, as SF Symbols names (use the platform's equivalent glyph):
Viewer `play.rectangle`, Filters `line.3.horizontal.decrease.circle`,
Library `square.grid.2x2`, Gallery Mapping `photo.on.rectangle.angled`,
Tag Mapping `tag`.

## 5. Viewer

**Header.** Title: the video's humanized title. Subtitle: credits. Actions,
in order:

1. **Exclude Pairing** (thumbs-down icon);
2. a **Contact Sheet | Video** mode control showing the current mode;
3. **Previous** and **Next** combination;
4. the position, "12 of 188", hidden when there are no combinations.

**Stage**, the left 75% on wide layouts:

- **Contact sheet** mode is the default for every new combination: the 4×4
  image, fitted, with breathing room. Double-click (desktop) or double-tap
  (touch) plays the video.
- **Video** mode plays immediately. Click or tap the video to play or pause.
  The transport bar has skip back 10 s, play/pause, skip forward 10 s,
  elapsed time, a scrubber and duration.
  - The scrubber previews the frame and timecode under the pointer or finger,
    seeks live while dragging, and seeks exactly on release.
  - Leaving video mode pauses. Returning to the same combination resumes
    where it paused. Moving to another combination stops playback and returns
    to the contact sheet.

**Slideshow**, the right 25%: the gallery's images in random order, advancing
every 2 s with a 0.3 s crossfade (no crossfade with reduced motion). The next
image is decoded before switching, so the fade never shows a blank frame. A
caption shows the gallery name and "3 of 11".

**Navigation** wraps at both ends, and the next combination's contact sheet is
prefetched.

**Context menu** on the stage (right-click or long-press): Exclude
"Gallery" from This Video, plus platform reveal actions where they exist.

**States** (each with its explanation and fixing action):

| Situation | Title | Actions |
|---|---|---|
| No contact sheet for the video | No Contact Sheet | Play Video |
| Video can't be played on this platform | Can't Play This Video, with the likely cause (for example "macOS can't play .mkv files") | Open in Default App (where possible), Show Contact Sheet |
| Gallery folder is empty | No Images (in the slideshow area) | — |
| No videos | No Videos, with the videos folder | Reload Library |
| No galleries | No Galleries, with the galleries folder | Reload Library |
| Filters exclude everything | No Matching Combinations (mentions that required tags only match videos marked Yes, when tags are required) | Edit Filters, Reset Filters |
| Filters at defaults but every video is excluded from every gallery | No Combinations | Open Gallery Mapping |

The stage stays dark in every appearance (§8.3), and everything on it uses
dark-appearance colors.

## 6. Other pages

### 6.1 Filters

Four sections, each with a title, a summary, a one-line explanation, and a
wrapping set of chips:

| Section | Mode | Default | Summary | Explanation |
|---|---|---|---|---|
| Galleries | Include | all | "All 9" / "8 of 9" | Videos are paired only with the galleries you include. |
| Studios | Include | all | "All 6" / "5 of 6" | Only videos from the studios you include are shown. |
| Tags | Require | none | "Any" / "2 required" | Only videos marked Yes for every selected tag in Tag Mapping are shown. |
| Cast | Require | none | "Any" / "1 required" | Only videos featuring everyone selected are shown. |

- Chips toggle on click or tap. Selected chips show a filled check and an
  accent tint; unselected chips show an empty circle.
- Include sections offer **Include All** and **Include None**; require
  sections offer **Clear**.
- A chip's context menu offers **Include Only "X"** and **Include All Except
  "X"** (include sections), or **Require Only "X"** (require sections).
- A search field narrows the chips in every section. A section with no
  matches says "No matches", and an empty vocabulary explains where it comes
  from.
- **Reset Filters** restores the defaults and is disabled when already at
  defaults. Changes apply immediately, and the header subtitle shows the
  combination count.
- A **preview panel** (an inspector on desktop; collapsible or below on
  narrow layouts) shows the combination count, how many distinct videos and
  galleries it spans, **Open Viewer**, and **Up Next**. Up Next lists the next
  10 combinations from the viewer's current position, with thumbnails, and
  selecting one opens it in the viewer.

### 6.2 Library

- **Grid.** Every valid video as a continuously scrolling (not paginated)
  grid of 16:9 contact-sheet cards, sorted by title. Each card shows the title
  and credits.
- **Header.** Subtitle: "22 videos", "4 of 22 videos" when searching, or "3 of
  22 videos selected". Actions: **Search**, **Select All**, **Deselect All**
  and **Delete**. The actions are always present and enable only when they
  apply.
- **Selection** follows §3.8. Selected cards show an accent ring and a check
  badge; red is reserved for the delete action.
- **Preview.** A large preview of the contact sheet: on hover after a short
  delay (desktop), or on tap or long-press (touch, §15.3).
- **Card context menu:** Select or Deselect, reveal in the file browser where
  available, and Delete. Delete acts on this video, or on the whole selection
  when the card is part of one.
- **Delete** confirms with "Delete 3 Videos?" (or "Delete "Title"?"). The
  dialog names the videos when there are six or fewer and states that the
  files, contact sheets, mapping decisions and cached metadata are
  permanently removed. **Cancel is the default.**
  - Success shows a brief confirmation ("Deleted 3 videos"); partial failures
    show an alert listing them.
- **Skipped files.** A notice above the grid, scrolling with it ("2 files
  skipped · Names must be lowercase, without spaces, in the form
  studio-cast-title"), offers **Show Files**, which lists each file and the
  reasons. If every file was skipped, the empty state says so.
- **States:** No Videos (with where to add them), and No Results for
  searches.

### 6.3 Gallery Mapping and Tag Mapping

A matrix with one row per video (thumbnail, title, credits) and one column per
gallery or tag. Cells:

| State | Look | Gallery Mapping | Tag Mapping |
|---|---|---|---|
| Undecided | neutral **–** | paired (default) | doesn't have the tag (default) |
| Yes | green **✓** | paired | has the tag |
| No | red **✗** | never paired | doesn't have the tag |

- **Cells.** Clicking or tapping a cell cycles Undecided → Yes → No →
  Undecided, and the whole cell is the target. A changed cell shows an
  orange ring and dot until saved, and cycling back to the saved value clears
  it.
- **Bulk actions.** A column header sets that column for every shown video,
  and a row's context menu sets every column for that video.
- **Header.**
  - Subtitle: "6 unsaved changes", "21 videos need decisions" or "All videos
    decided".
  - Actions: **Show: Undecided | All** (default Undecided), Search, **Revert**
    and **Save**. Save is the one emphasized action.
- **Matrix layout.** The column header row stays pinned, and many columns
  scroll horizontally. With few columns, the matrix still spans the page.
- **Status bar.** A legend (Undecided, Yes, No, "Click a cell to cycle"), the
  unsaved-change count and "21 of 22 videos shown".
- **Saving** follows §3.3 and confirms "Saved 6 changes". **Revert** always
  confirms.
- **Pending changes** live outside the page. They survive page switches,
  search, the scope toggle and reloads, and are dropped only for videos or
  columns that no longer exist. Leaving the page never discards them.
- **States:** No Galleries / No Tags (with where to add them), No Videos,
  **All Caught Up** (with Show All Videos), and No Results.

### 6.4 Clean Up Stale Entries

A modal sheet or dialog per §3.5, with an icon, a title, a one-line
explanation, the summary grid and the entry list. The buttons are Cancel and
**Remove N Entries**, which is destructive, and is not the default action in
the high-risk case.

### 6.5 Settings

- **Appearance:** System, Light or Dark. **Dark is the default**, and the
  viewer stage is dark in all three.
- **Library:** the configuration file and the videos and galleries folders,
  each with a reveal action where the platform allows. On Android and Desktop,
  this is also where you choose a different library (folder or configuration
  file).

### 6.6 Startup progress

An app glyph, the step title (§3.2), a progress bar (determinate during
preview generation), and a detail line reserved even when empty, so the
layout never jumps.

### 6.7 Startup error

Title: "Couldn't Load Your Library". Then the error and, for invalid JSON, the
offending key or path. Where pvorg looks for its configuration. **Try Again**
(the default action), and a reveal action when the file exists.

### 6.8 Optional capabilities

Capabilities an app may offer. Each follows these rules wherever it exists;
§17 records which apps have it.

| Capability | Behavior |
|---|---|
| **Video details** | Duration, resolution, frame rate, file size and quality score (§2), from `cache.json`, shown in the Library preview and card tooltip. The Library header gains a **Sort** menu: Title (default), Quality, Duration, Resolution, Size, each ascending or descending. Videos without metadata sort last. |
| **Regenerate Contact Sheet** | A Library card menu item (where previews can be generated) that replaces `img/<filename>.jpg`, with a progress indicator on the card and a confirmation when done. |
| **Tag vocabulary** | Tag Mapping's header gains **Add Tag** (a small dialog accepting comma-separated names), each tag column menu gains **Remove Tag…**, and the No Tags state offers Add Tag. Rules in §3.9. |
| **Player volume and full screen** | In video mode, ↑ / ↓ change volume by 10%, M mutes, and F toggles full screen (Esc also leaves it). The transport bar shows a volume control and a full-screen button. |
| **Missing-tool warning** | When `ffmpeg` or `ffprobe` is missing, a warning callout in the Library (and on the startup screen during step 5) names the tool and how to install it. |
| **Import from pvorg.yml** | **File › Import from pvorg.yml…** (or Settings): choose the file (default `~/pvorg.yml`), review the preview, confirm. Rules in §3.10. |

---

## 7. Commands and input

### 7.1 Commands

| Command | Where | Keyboard (macOS, Desktop, Web) | Android |
|---|---|---|---|
| Go to Viewer / Filters | navigation, menu | V / C | navigation; same keys with a hardware keyboard |
| Toggle contact sheet / video | Viewer | P | mode control, double-tap; P |
| Previous / Next combination | Viewer | B / N | header buttons, horizontal swipe on the stage; B / N |
| Exclude Pairing | Viewer | ⌫ (Backspace/Delete) | header button, stage menu; ⌫ |
| Play / Pause | Viewer, video mode | Space | tap the video; Space |
| Skip back / forward 10 s | Viewer, video mode | ← / → | transport buttons; ← / → |
| Jump to 0%…90% | Viewer, video mode | 0…9 | 0…9 |
| Volume up / down, Mute, Full screen (optional, §6.8) | Viewer, video mode | ↑ / ↓, M, F | — |
| Undo / Redo | anywhere | ⌘Z / ⇧⌘Z (Ctrl on non-Mac) | Snackbar Undo |
| Select All / Deselect All / Delete | Library | ⌘A / Esc / ⌘⌫ (Ctrl+A / Esc / Delete on non-Mac) | header actions; selection mode |
| Save mapping changes | Mapping | ⌘S (Ctrl on non-Mac) | header Save |
| Reload Library | anywhere | ⌘R (Ctrl+R on non-Mac); More menu on Web | overflow menu |

Rules:

- **Typing always wins.** While a text field has focus, every key goes to
  the field, including the single-key shortcuts above. Esc in a search field
  follows the platform convention: it clears the field on macOS and the Web,
  and leaves the field while keeping its query on Android and Desktop.
  Clicking or tapping elsewhere also leaves it, after which the shortcuts work
  again.
- **Scoped keys.** Viewer keys act only while the viewer is showing, and
  playback keys only in video mode. Elsewhere, arrows and Space keep their
  usual behavior.
- **Live state.** Shortcuts always act on the current state, never on a
  stale copy of it.
- **Discoverable.** Every shortcut is discoverable in a menu, a tooltip or
  the accessibility label of its control.

### 7.2 Feedback and safety

- **Completed actions** get a brief, non-blocking confirmation (toast or
  snackbar). It is announced to assistive technology, auto-dismisses after
  about 2.6 s, or about 6 s when it carries an action such as Undo.
- **Errors** use an alert or dialog, because they need acknowledgement.
- **Permanent actions** (deleting videos, removing stale entries) always
  confirm, and Cancel is the default action.
- **Reversible actions** (Exclude Pairing, mapping edits before saving) never
  confirm; they offer Undo or Revert instead. Revert discards work, so it
  confirms.

---

# Part III — Design

## 8. Design language

### 8.1 Principles

1. **Quiet chrome, immersive media.** The imagery is the content; navigation,
   headers and controls recede.
2. **Native first.** Each app uses its platform's standard structures and
   components: macOS sidebar and toolbar, Material 3 on Android, semantic and
   responsive HTML on the web. Custom components exist only where the
   platform has no equivalent: the chip, the tri-state cell, the transport bar.
3. **Restraint.** One accent color (the platform or user accent), semantic
   colors, system typography, and decoration only where it carries meaning.
4. **State is never color alone.** Every state also has a shape, glyph or
   label.
5. **No layout jumps.** Controls enable and disable instead of appearing and
   disappearing. Toggling a chip never reflows. Empty detail lines are
   reserved.

### 8.2 Tokens

Values are in points (macOS), dp (Android) or CSS px (web).

| Token | Values |
|---|---|
| Spacing scale | 2, 4, 8, 12, 16, 24, 32 |
| Radius | small 5 (cells, chips), medium 8 (thumbnails, cards, callouts), large 12 (floating surfaces, toasts, previews) |
| Viewer split | stage 75%, slideshow 25%, 1 px stage hairline between |
| Library grid | adaptive columns, card min 220 / max 320, gaps 16 horizontal / 24 vertical, page padding 24 |
| Mapping matrix | label column 300, data column 84, row 52, header 44 |
| Minimum desktop window | 960 × 600 |
| Thumbnail decode sizes (longest edge, px) | 320 lists, 720 cards, 1920 slideshow and previews, 4096 full contact sheet |

### 8.3 Color

| Role | Light | Dark | Use |
|---|---|---|---|
| Accent | platform/user accent; `#2563EB` on Web and Desktop | platform/user accent; `#3B82F6` on Web and Desktop | selection, primary actions, links |
| Subtle fill / hover | primary at 6% / 10% | same | unselected chips, undecided cells, hover |
| Selected chip fill / hover | accent at 17% / 24% | same | selected chips |
| Hairline | system separator | same | dividers |
| Thumbnail placeholder | primary at 8% | same | images while loading |
| **Stage** | `#0F0F0F` | `#0F0F0F` | viewer and slideshow background |
| Stage raised | `#1F1F1F` | `#1F1F1F` | placeholders on the stage |
| Stage text / secondary | white 94% / 62% | same | text on the stage |
| Stage hairline | white 8% | same | dividers on the stage |
| Decision Yes | `#1A8740` | `#45CC73` | ✓ glyph; cell fill is this color at 18% |
| Decision No | `#CC2121` | `#FF6B66` | ✗ glyph; cell fill at 16% |
| Pending change | system orange | system orange | ring and dot on unsaved cells |
| Warning / critical | orange / red | same | callouts; tinted 10% fill, 25% border |

The decision colors are tuned so their glyphs keep at least 3:1 contrast
against their tinted cells in both appearances.

### 8.4 Typography

Use the platform's system typeface and text styles: SF Pro text styles on
macOS, the Material 3 type scale on Android, and on the web the system font
stack with a rem-based scale. Monospaced (tabular) digits wherever numbers
change in place: counts, positions, timecodes. Titles truncate at the tail,
paths and filenames in the middle.

### 8.5 Motion

| Motion | Duration |
|---|---|
| Thumbnail fade-in | 0.18 s ease-out |
| Slideshow crossfade | 0.3 s ease-in-out, every 2 s |
| Toast in/out | about 0.35 s spring or ease; reduced motion uses opacity only |
| Hover preview | 220 ms initial delay; switches instantly between neighbors for 400 ms after one hides |
| Chip, selection, cell hover | 0.1–0.18 s |

Reduced-motion settings remove the crossfade and all movement.

## 9. Components

| Component | Requirements |
|---|---|
| **Async thumbnail** | Decodes off the main thread at one of the §8.2 sizes, into a memory-bounded cache with in-flight de-duplication. Never does disk I/O during rendering. Holds its own reference so cache eviction can't blank a visible image. Placeholder while loading; a photo glyph if the file is missing. |
| **Filter chip** | Leading check-circle / circle glyph plus label. Same width in both states. Small radius. Accessible as a toggle with a selected state. |
| **Tri-state cell** | Glyph (✓ ✗ –) on a tinted rounded rect. The whole cell is the target. Unsaved: 1.5 px orange ring plus a dot. Accessible label "Title, Column" and value "Yes, unsaved". |
| **Video card** | 16:9 thumbnail (medium radius), title (one line, tail truncation), credits (one line). Selected: 3 px accent ring and a check badge. Hover (desktop): empty circle badge. |
| **Transport bar** | 32-pt or 48-dp targets for skip, play/pause and skip. Tabular timecodes. A scrubber that grows on hover, with a frame preview (224 × 126, medium radius) and timecode label. Accessible as an adjustable control (10 s steps). |
| **Callout** | Inline warning or critical notice: icon, title, message, optional action. |
| **Toast / snackbar** | Floating confirmation with an icon, a message (up to two lines) and an optional action. |
| **Empty state** | Platform empty-state component (ContentUnavailableView on macOS): icon, title, specific explanation, the action that fixes it. |
| **Large preview** | Floating panel on desktop, sized to the image and the screen (at most 920 × 518, 60% of the screen). On touch, a dismissible full-screen or dialog preview. Dark surface. |

## 10. Accessibility

Required on every platform:

- Every control has an accessible name, including icon-only buttons; cards
  combine title and credits.
- Toggles expose a selected state, and the scrubber is adjustable.
- Contrast: body text at least 4.5:1; glyphs and large text at least 3:1.
- State is never conveyed by color alone (§8.1).
- Touch targets are at least 44 pt (macOS pointer targets at least 20 pt)
  on macOS and at least 48 dp on Android; web targets are at least 24 × 24
  CSS px, 44 for touch.
- Full keyboard operation on desktop, with visible focus indicators (web
  `:focus-visible`).
- Respect reduced motion, and the platform text-size or zoom settings without
  clipping.
- Announce completed actions; manage focus when dialogs open and close.

## 11. Performance

- No disk or network I/O for images on the rendering path. Thumbnails decode
  asynchronously at display size and are cached.
- Lists and grids are lazy; only visible rows and cards exist.
- Derived lists (sorted videos, mapping rows) are recomputed when their inputs
  change, not on every interaction. Cycling one cell must not rebuild the
  matrix.
- Prefetch the next combination's contact sheet and the next slideshow image.
- Seek previews are generated asynchronously and cached per second.

## 12. Decision log

The main decisions and why they were made. Add a row whenever a design
decision changes.

| Decision | Why |
|---|---|
| Sidebar or rail navigation grouped Browse / Organize, instead of tabs inside the content area. | The standard multi-section pattern on every platform. It frees the header for page actions and carries badges. |
| Pages renamed: Home → Viewer, Config → Filters, Deleter → Library, Mapper → Gallery Mapping, Tag Mapper → Tag Mapping. | "Config" suggested settings, but the page filters combinations. "Deleter" named an action, not a place. "Mapper" was ambiguous. |
| V and C single-key navigation kept; key hints moved from labels to menus and tooltips. | Muscle memory in a keyboard-driven app; labels stay clean. |
| Single-key shortcuts dispatched against live state, and never while typing. | Plain-key menu shortcuts swallowed typing in search fields and acted on stale menu state. |
| Viewer title is the video; credits in the subtitle; gallery name on the slideshow caption. | Clear hierarchy, and the raw filename is no longer the title. |
| Mode control showing the current mode (Contact Sheet / Video). | The old "VID"/"TGP" button named the *other* mode, in jargon. |
| Custom transport bar with frame previews and live scrubbing. | The old bar was an unlabeled strip that seeked only on release. |
| Resume when returning to the same video. | Checking the contact sheet shouldn't lose your place. |
| Explicit unplayable-file state. | It used to be a silent black rectangle. |
| Exclude Pairing in the viewer, called *Exclude* (not Delete), no confirmation, with Undo, removing the pairing in place. | Bad pairings are spotted while browsing. "Delete" already means permanent file deletion. The action is frequent and reversible. Reshuffling would lose your place. |
| Distinct empty states per cause. | Each has a different fix. |
| Filters state their rule (include vs. require) with summaries and explanations. | The two semantics looked like opposite states of one control. |
| Tags opt-in, galleries opt-out. | A required tag should narrow the list to videos actually tagged, as in the original V1 app. New videos still pair with every gallery, and Exclude Pairing can veto one pairing. |
| Chips at natural width, tinted selection with a check. | Equal-width grids truncated names, and a wall of solid accent said nothing. |
| Preview panel with Up Next following the viewer's position. | Answers "what will I see?" and jumps straight to it. |
| Continuous grids and matrices instead of pagination. | With async thumbnails, scrolling is faster than paging, and selection works across the library. |
| Selection limited to what's shown. | What you see is what you delete. |
| Accent for selection, red only for Delete. | One selection language; the destructive color marks the consequence. |
| Deletion stays permanent, confirmed with names and Cancel as the default. | Video files are large, and the product always said "can't be undone". |
| Skipped files shown with reasons. | Misnamed files used to vanish silently. |
| Pending mapping changes outlive the page; Revert confirms; badge in navigation. | Toggling "hide decided" or leaving the page used to discard work. |
| "Show: Undecided / All" instead of "Hide fully decided". | It states what is shown. |
| Tinted cells with glyphs, an orange unsaved marker, full-cell targets and a legend. | Solid red and green blocks overwhelmed the matrix; state never relies on color alone. |
| Column and row bulk actions. | Mapping a new gallery used to take one click per video. |
| Named startup steps with determinate progress; recoverable error screen with Try Again. | The old loading screen showed "0 videos" throughout, and errors needed a relaunch. |
| Reload Library and Clean Up Stale Entries as commands; the risky cleanup can't be confirmed with Return. | Reload had no UI; a disconnected drive could wipe every mapping. |
| Dark stage in every appearance; Dark remains the default appearance. | Media reads true, and the original app was dark-only. |
| Undoing by any route replaces the Exclude message with "Restored …". | After ⌘Z or a keyboard undo, the old message's Undo lingered and did nothing. |
| A video whose file can't be deleted keeps its decisions and cached metadata. | Removing them while the file stays would silently lose work. |
| The Electron app adopts the shared `pvorg.json` library, with a one-time `pvorg.yml` importer. | One library that works in every app. Its old model (hand-added paths, yes-only pairs) couldn't be shared. |
| Electron renderer is sandboxed and talks to the main process over typed IPC; media load through a restricted custom protocol; no local HTTP server. | The old local server accepted requests from any origin, so any web page could edit the library, and web security was switched off. |
| Quality score normalizes bitrate to 640 × 480 at 30 fps. | The old formula multiplied by resolution, counting it twice; resolution is now its own column. |
| Web and Desktop use a fixed blue accent. | Browsers don't expose the system accent; Desktop shares the web design system. |
| Extras are specified once as optional capabilities, with per-app availability. | One app's extra features shouldn't fork the product's behavior. |
| One shared spec for all apps. | One product, one source of truth; platform sections record the honest differences. |

---

# Part IV — Platforms

## 13. macOS — pvorg-native

- **Stack.** Swift 6, SwiftUI with AppKit where needed, AVKit and
  AVFoundation, SwiftPM. macOS 14+.
- **Structure.** `NavigationSplitView` sidebar; a unified toolbar per page;
  `.searchable`; an inspector for the Filters preview; sheets, alerts and
  confirmation dialogs; a Settings window; single window.
- **Menus.**
  - File: Reload Library ⌘R, Clean Up Stale Entries…, Save Mapping Changes ⌘S
    and Revert Mapping Changes….
  - Go: Viewer V, Filters C, the rest without keys.
  - Viewer: mode P, Previous B, Next N, Exclude ⌫, Play/Pause Space, Skip ←
    and →, Jump To 0–9.
  - Edit: Undo / Redo Exclude Pairing.
  - Library toolbar: ⌘A, Esc, ⌘⌫.
- **Platform specifics.** Reveal in Finder throughout; a hover preview
  floating panel; glass styling on macOS 26+.
- **Playback.** AVFoundation can't play mkv, avi or wmv; those files show the
  unplayable state with **Open in Default App**.
- **Previews.** Generates contact sheets and metadata with ffmpeg and
  ffprobe. Scrubber frames come from AVAssetImageGenerator.
- **Verification.** Requires a full Xcode installation; the Command Line Tools
  alone can't compile the asset catalog or SwiftUI's macros, or run tests.
  - Unit tests: `swift test`.
  - `Scripts/make_ui_fixture.sh` builds a synthetic library.
  - A debug-only UI tour (`PVORG_UI_TOUR=<dir>`) captures every page and state
    in both appearances and checks every shortcut with real key presses.
  - `PVORG_CONFIG` points the app at another library.

## 14. Web — pvorg-web

- **Stack.** A Python FastAPI server scans the library, generates previews
  (contact sheets, sprites, metadata), writes `pvorg.json` and serves media.
  A React + TypeScript single-page app is the UI.
- **Structure.** One route per page (`/`, `/filters`, `/library`,
  `/mapping/galleries`, `/mapping/tags`, `/settings`), so pages are
  bookmarkable and the back button works.
  - Wide screens: a persistent sidebar.
  - Narrow screens: a collapsible menu. Below about 900 px the viewer stacks
    the stage above the slideshow.
- **Conventions.** Semantic HTML landmarks, real `<button>` and `<a>`
  elements, labeled form controls, `:focus-visible` rings, and native
  `<dialog>` for confirmations.
  - Appearance follows `prefers-color-scheme` when set to System.
  - Shortcuts use Ctrl on non-Mac systems.
  - Undo works through the toast and Ctrl/⌘+Z.
- **Playback.** Browser codecs: mp4 (H.264) and webm play; avi and wmv don't;
  mkv depends on the browser and codec (Chromium often plays H.264 mkv).
  Unplayable files show the unplayable state.
- **Web stand-ins.** "Open in Default App" becomes Download Video and Open
  Video in New Tab; reveal-in-Finder actions become Copy Path. Reload Library
  lives in the More menu, because the browser owns ⌘R / Ctrl+R.
- **Previews.** Seek previews use the server-generated sprite sheet and VTT,
  with a fallback when they're missing.
- **Configuration.** `~/pvorg.json` or `PVORG_CONFIG`, read on the server.
- **Verification.**
  - Backend unit tests.
  - Frontend type-check and build.
  - Playwright screenshots of every page and state in both appearances and at
    desktop and narrow widths, against the fixture library.

## 15. Android — pvorg-android

- **Stack.** Kotlin, Jetpack Compose with Material 3, Media3 (ExoPlayer),
  Coil, and the Storage Access Framework. Tablet-first and landscape;
  minimum SDK 29.

### 15.1 Library model

- The user picks a root folder containing `pvorg.json`, `VID`, `VID/img` and
  `GAL` (§1.1). Access is persisted, and Settings can change the folder.
- Android has no ffmpeg, so it **does not generate previews**. It uses
  contact sheets and metadata made on a computer. Videos without a contact
  sheet still appear, with the No Contact Sheet state.
- Writes to `pvorg.json` follow §1.2: atomic where the provider allows,
  otherwise a full rewrite of the document (Storage Access Framework).

### 15.2 Structure

- A Material 3 navigation rail (or navigation drawer), with the §4 pages,
  groups and badges.
- A top app bar per page, holding the title, subtitle and actions.
- Snackbars for confirmations and Undo; dialogs for confirmations and
  errors.
- Material 3 dynamic color. The stage stays dark.

### 15.3 Touch adaptations

| Desktop behavior | Android |
|---|---|
| Hover preview | Tap a card for a large preview. In selection mode, a tap toggles selection instead. |
| Click to select | Long-press starts selection mode, then taps toggle; the app bar shows the count and Select All, Deselect All and Delete. |
| Right-click menus | Long-press menus |
| Previous / Next | Header buttons, or a horizontal swipe on the stage |

Hardware-keyboard shortcuts follow §7.1.

### 15.4 Playback and verification

- **Playback.** Media3 plays mp4, mkv and webm, among others. Unsupported
  codecs show the unplayable state. Scrubber frames come from
  MediaMetadataRetriever, asynchronously.
- **Verification.**
  - JVM unit tests: `./gradlew testDebugUnitTest`.
  - A debug-only hook loads a library from device storage without the
    folder picker, so an emulator tour can screenshot every page and state in
    both appearances.

## 16. Desktop — PP-Video-Organizer (Electron)

- **Stack.** Electron (current stable), electron-vite, React + TypeScript.
  The main process owns the library: it implements Part I in TypeScript,
  reads and writes `pvorg.json`, scans folders and runs `ffmpeg` and
  `ffprobe` from `PATH`. Packaged with electron-builder for macOS, Windows and
  Linux.
- **Security.**
  - The renderer is sandboxed with context isolation and no Node access, and
    calls the main process only through a typed preload API over IPC.
  - Video and image files load through a custom `pvorg-media:` protocol that
    serves only files inside the library's folders.
  - A strict Content-Security-Policy; no remote content; no local HTTP
    server; external links open in the default browser.
- **Structure.** A native application menu per OS, with File (Reload Library,
  Clean Up Stale Entries, Import from pvorg.yml), Edit, View, Go, Viewer,
  Window and Help, carrying the §7.1 accelerators. A sidebar like the web
  app's, and native window chrome.
- **Platform actions.** Open in Default App and Reveal in Finder / Show in
  Explorer / Show in Folder use the OS shell.
- **Playback.** Chromium codecs: mp4 (H.264) and webm play, mkv often plays,
  avi and wmv don't. Scrubber frames come from a hidden second video element,
  generated asynchronously and cached per second.
- **Previews.** Generates contact sheets and metadata like macOS (§3.2).
- **Optional capabilities.** All of §6.8.
- **Verification.**
  - Unit tests for every Part I rule, including the shared compatibility
    sequence.
  - A packaged build.
  - A Playwright tour that launches the real Electron app against a fixture
    library and screenshots every page and state in both appearances.
  - `PVORG_CONFIG` points it at another library.

## 17. Conformance

Status of each app against this spec at the version above. ✓ conforms,
◐ partial (see note), — not applicable or not offered.

| Area | macOS | Desktop | Web | Android |
|---|---|---|---|---|
| §1–3 data rules (tags opt-in, mapping saves, Exclude Pairing + undo, deletion, stale cleanup) | ◐ v1.1 changes (undo feedback, failed-delete rule) written but not yet built: Xcode unavailable | ✓ | ✓ | ✓ |
| §4 navigation and page names | ✓ | ✓ | ✓ | ✓ |
| §5 viewer, all states | ✓ | ✓ | ✓ | ✓ |
| §6.1–6.7 Filters, Library, Mapping, Cleanup, Settings | ✓ | ✓ | ✓ | ✓ |
| §7 commands and keyboard rules | ✓ | ◐ plain keys are tested through the page, not the OS menu, so no test proves a menu item never fires twice for one key press | ✓ | ✓ |
| §8–11 design, accessibility, performance | ✓ | ◐ no automated contrast audit | ◐ no automated contrast audit | ◐ no TalkBack or large-font pass yet |
| Preview generation (§3.2 step 5) | ✓ | ✓ | ✓ | — (by design, §15.1) |
| Optional: video details and sort | — | ✓ | — | — |
| Optional: regenerate contact sheet | — | ✓ | — | — |
| Optional: tag vocabulary | — | ✓ | — | — |
| Optional: player volume and full screen | — | ✓ | — | — |
| Optional: missing-tool warning | — | ✓ | — | — |
| Optional: import from pvorg.yml | — | ✓ | — | — |

## 18. Maintaining this spec

- **One file, four copies.** Change `docs/SPEC.md` in all four repositories
  in the same piece of work, bump the version line, and keep the copies
  byte-identical.
- **Spec first.** Update the spec before or with the code. A behavior that
  isn't in the spec is a bug in one or the other.
- **Deviations.** A platform that can't meet a "must" records the reason in
  its Part IV section and in §17, rather than silently differing.
- **Decisions.** New UX decisions add a row to §12 with the reason.
- **Platform docs.** Platform READMEs cover building, running and developer
  tooling only. They link here for behavior and design.

## Glossary

| Term | Meaning |
|---|---|
| Combination / pairing | One video shown with one gallery. |
| Contact sheet (TGP) | The 4×4 grid image previewing a video; stored in `img/`. |
| Relation | A video's entry in `videoRelations`. |
| Tri-state | Yes / No / Undecided decision per gallery or tag. |
| Stage | The dark media area of the viewer. |
| Stale entry | A relation whose video file no longer exists. |
| Orphaned asset | A generated file whose video no longer exists. |
| Skipped file | A video file whose name breaks §1.3. |
