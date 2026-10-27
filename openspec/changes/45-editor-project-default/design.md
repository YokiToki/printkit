# Design

## Context

`39` made the document a small JSON description plus content-addressed meshes in IndexedDB — deliberately in the shape a file needs. `EDITOR.md` fixes the `.pkit` layout. Desktop editors (Blender `.blend`, Fusion `.f3d`, Tinkercad's cloud) set the user's expectations: Ctrl+S, recent files, crash recovery.

## Goals / Non-Goals

**Goals**: a self-contained, versioned, validated file; no data loss on crashes; the editor as the natural landing page without breaking anything else.
**Non-Goals**: cloud, collaboration, other CAD formats.

## Decisions

1. **Container.** ZIP written and read with `fflate` (already used for 3MF). Entries: `meta.json` (`{format:'pkit', formatVersion, app, appVersion, name, created, modified}`), `scene.json` (the document: objects, stacks, sketches, cuts; schema number, lengths in mm), `meshes/<sha256>.bin` (little-endian: magic `PKM1`, vertex count, index count, Float32 positions, Uint32 indices; file name = hash of the payload so identical meshes are stored once and integrity is checkable), `sketches/` is part of `scene.json` (no separate files in v1), `thumb.png`. Compression: meshes stored with deflate level 6 (float data compresses poorly but index data well); `scene.json` level 9.
2. **Versioning.** `formatVersion` is an integer independent of the app version. `migratePkit(raw)` upgrades older `scene.json` layouts step by step (reusing `migrateScene` of the editor); a file with a higher `formatVersion` opens with a warning ("created by a newer version, some data may be dropped when saving") and unknown fields are preserved in `extra` and written back unchanged.
3. **Guards.** Maximum archive 1 GB and uncompressed total 2 GB, at most 5 000 entries, entry paths must match `^(meta\.json|scene\.json|thumb\.png|meshes/[0-9a-f]{64}\.bin)$`, no directory traversal, per-entry size limit 512 MB, mesh hash verified on load (mismatch → that object marked "mesh corrupted" and logged), JSON size limit 50 MB. Violations refuse the file with a message and change nothing. Opening never executes anything.
4. **Save.** `saveProject()` serialises the current document and the meshes referenced by it (and by `originMeshId`), builds the ZIP off the main thread (worker with progress job), then either writes through a stored `FileSystemFileHandle` (File System Access API: `showSaveFilePicker` on first save, handle kept in IndexedDB with permission re-request) or downloads `<name>.pkit`. The dirty flag clears after a successful write; Save As always asks. File name defaults to the project name (sanitised).
5. **Open.** `openProject(file)`: guards → hashes → `migratePkit` → replace the working document (after the unsaved-changes prompt) → register meshes in the mesh store → clear history → fit the camera. Drag-and-drop of a `.pkit` anywhere on the page opens it; dropping STL files while a project is open imports them (as in `39`). The Open dialog also accepts STL (routed to import) for convenience.
6. **Dirty state and prompts.** `dirty` = document changed since last save or open (history pointer vs saved pointer, so undoing back to the saved state clears it). `beforeunload` prompts only when dirty. New and Open ask to save, discard or cancel.
7. **Autosave.** After 2 s of idle following a change (max every 30 s under constant editing), a snapshot `{projectId, time, scene, meshIds}` is written to IndexedDB (`pkit-autosave`) with the meshes already in the mesh store (no duplication); ring of 3 snapshots per project, 10 projects, oldest evicted and unreferenced meshes collected. On startup, if a snapshot is newer than the last saved/open time of the project (or no project was saved), a banner offers Restore or Discard. A `BroadcastChannel` with a per-project lock detects a second tab editing the same project and shows a warning on the later tab (read-only banner with "Take over").
8. **Recent projects.** `pkit-recent` in IndexedDB: `{id, name, modified, thumbnail (PNG blob ≤ 40 KB), handle?}`; with a stored handle the project reopens in one click (permission prompt if needed), otherwise it opens the latest autosave snapshot of that project, otherwise the entry offers the Open dialog. Thumbnails come from the viewport (offscreen render at 256 px) at save time.
9. **Entry route.** Router: `/` → `EditorMode` with `StartOverlay` shown while the project is empty and "unstarted" (not dismissed); `/editor` redirects to `/`; `/generators` is the old `StartPage` product chooser; unknown paths go to `/`. `lastSession` records `editor`, `gridfinity`… as before; "Continue" on the overlay restores the last project (autosave or recent). Header: the logo links to `/`; the product switcher shows Editor and Generators entries; inside a generator the logo text keeps the active product. Tests cover the redirects and that every old deep link still resolves.
10. **Generator round trip.** Each generator mode exposes its parts (`ModelResult`) and parameters. *Send to Editor*: for every part a mesh object is created (mesh into the store, source `mesh` plus `origin: {product, mode, params, part}`), grouped under one name; the editor opens at `/`. *Edit in generator*: stores a handoff record in IndexedDB `{id, product, mode, params, objectIds}`, navigates to the generator route with `?handoff=<id>`, the mode initialises its state from the record and persists to `<key>.handoff` instead of the main key (a `persistKey` override in `usePersistedState`), and `HandoffBar` shows "Back to editor". On return the new parts replace the meshes of the object(s) by id in one history step (transform and stack kept; if the part count changed, extra objects are added and missing ones are removed with a note in the log). Cutout and Keychain image modes depend on stored files; they are supported only when their stores still hold the files (otherwise the button is disabled with the reason).
11. **Compatibility.** No storage key changes. The previous `/` page content moves unchanged to `/generators`. The README and the beta notice mention the editor. The version is 2.0.0 per the semantic-versioning rule (moved route).

## Risks / Trade-offs

- **File System Access API** exists only in Chromium; other browsers fall back to downloads with no in-place save. The UI says which mode is active and the download path is always tested.
- **Large projects** (hundreds of MB of meshes) make save and autosave slow; saves run in a worker with progress, autosave is incremental because meshes are content-addressed and already stored.
- **Handoff complexity** (state under a separate key, return bar) touches every generator mode; implemented once in a shared hook and covered by a test per mode.
- **Behaviour change of `/`.** Users with the old bookmark see the editor; mitigated by the generators row on the start overlay and by keeping all deep links.
- **Autosave privacy**: snapshots stay in the browser; a "Clear local data" action in the project menu lists what is stored and removes it.

## Open Questions

- Whether the start overlay should show on every visit with an empty project or only the first time (assumed: whenever the scene is empty).
- Whether the thumbnails should be taken with a fixed camera (assumed: current camera, fit to scene).
