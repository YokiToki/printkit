# Proposal

## Why

The editor of `39`–`44` keeps its scene in the browser's storage: it survives a reload but cannot be moved to another computer, shared, versioned or backed up, and one cleared site-data setting loses everything. A real editor has a project file. It also still sits behind a chooser page as one of four products, although it is meant to be the main mode (`openspec/EDITOR.md`). This change closes the series: the `.pkit` project file, safe autosave and recovery, and making the editor the entry point of the site, with the generators reachable as a section and as sources of objects for the editor.

## What Changes

- **`.pkit` project files.** Save (download, or in place where the browser supports the File System Access API), Save As, Open (dialog and drag-and-drop anywhere on the page), New. The file is a ZIP container (`fflate`) containing `project.json` (scene tree, sketches, parameters, stack operations, 3D notes/pins), `meshes/<hash>.bin` (content-addressed binary meshes), `thumb.png` (project thumbnail), and `meta.json`.
- **ZipSlip security and limits.** Strict safety checks on unpacking: prevention of directory traversal (`..` or absolute paths in member names), member count and byte limits (manifest $< 64$ MB, total archive $< 1$ GB), duplicate entry rejection, JSON schema validation.
- **3D Notes and Pins.** Interactive surface annotation pins anchored to 3D geometry coordinates, stored within the project, allowing users to attach design notes and tolerances directly onto parts.
- **Autosave and recovery.** The working document is autosaved to IndexedDB shortly after each change (debounced) as a ring buffer of the last three snapshots; after a crash or a closed tab the editor offers to restore the newest snapshot that is newer than the last save. Two tabs editing the same project are detected and warned.
- **Editor as the entry point (major).** `/` opens the editor with a start overlay on an empty project: New, Open, Recent projects (thumbnail, name, date), Import STL, Continue the last project, and a row of the generator cards. The previous product chooser moves to `/generators`; generator routes (`/gridfinity/…`, `/keychain/…`, `/rack/…`) and every storage key stay as they are. The header logo and the product switcher are adjusted; the footer, beta notice and `README` follow.
- **Generators ↔ editor.** In every generator mode a **Send to Editor** button puts the current model parts into the editor scene as objects that remember their origin (`product`, `mode`, parameters), and in the editor an object with an origin gets **Edit in generator**: it opens the generator preloaded with those parameters, with a persistent "Back to editor" bar; on return the object's mesh is replaced and its transform and stack are kept. While in this round trip the generator state is held under a separate handoff key, so the user's own saved generator settings are not overwritten.
- **Housekeeping.** The `lastSession` record gains the editor; the start-page art for the Editor from `39` is used on the overlay; strings and README updated.

## Capabilities

### New Capabilities
- `editor-project-file`: `.pkit` format, save/open/new, versioning, ZipSlip guards, 3D notes/pins, dirty state.
- `editor-autosave`: autosave snapshots, recovery, multi-tab warning, recent projects.
- `editor-default-entry`: new entry route, start overlay, `/generators`, generator round trip.

### Modified Capabilities

## Impact

- New `src/editor/project/{pkit,migrate,zip,hash,autosave,recent,fileAccess}.ts` (React-free where possible), `src/features/editor/{ProjectMenu,StartOverlay,RecentList,RestoreBanner,HandoffBar}`, changes in `app/routes.tsx`, `StartPage` (becomes the generators chooser), `Header`, `AppShell`, `lastSession.ts`, the generator modes (Send to Editor button, `persistKey` override for handoff), `README.md`, `CHANGELOG.md`, strings in en and ru, tests. Uses `fflate` (already a dependency).
- Stored settings stay compatible (no migration needed); routes: `/` changes meaning and the chooser moves to `/generators` — the reason for a major version. Old deep links `#/gridfinity/box` etc. keep working.
- Out of scope: cloud storage or accounts, sharing links, version history/branches of a project, merging files, embedding generator parameters as live links (the round trip replaces the mesh), WebMCP tools for the editor (a later extension of `38`), importing other CAD formats (STEP, 3MF project files of slicers), password protection.
- Version 2.0.0 (major: the route `/` now opens the editor and the product chooser moves to `/generators`).
- Depends on: `44h-editor-mesh-repair-wizard` (the complete editor polish series).
