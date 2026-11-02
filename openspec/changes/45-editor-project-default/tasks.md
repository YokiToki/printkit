# Tasks

## 1. Spike

- [ ] 1.1 File access and size: in a throwaway page check `showSaveFilePicker`/handle persistence in IndexedDB and permission re-request in Chrome, the download fallback in Firefox and Safari, and the time to zip a 300 MB scene with `fflate` in a worker; record the limits and the supported-browser table in `design.md` (Decision 4, Risks).

## 2. Project format (React-free, `src/editor/project/`)

- [ ] 2.1 `hash.ts` and `meshBin.ts`: SHA-256 (Web Crypto) of the payload and the `PKM1` mesh codec. Test: round trip, hash stability, bad magic, truncated data.
- [ ] 2.2 `pkit.ts`: build and read the ZIP (`meta.json`, `scene.json`, meshes, `thumb.png`), compression levels, guards (paths, counts, sizes, hashes), `extra` preservation. Test: round trip of a scene with all sources, `..` path refused, oversize refused, corrupted mesh marks only its objects, unknown fields kept.
- [ ] 2.3 `migrate.ts`: `migratePkit` for older `formatVersion`s (the first release has version 1, so a synthetic v0 fixture proves the mechanism) and newer-version warning. Test: migration order and idempotence.
- [ ] 2.4 `dirty.ts`: dirty tracking by history pointer vs saved pointer. Test: change, undo to saved, save, redo.

## 3. Autosave and recent (`src/editor/project/`)

- [ ] 3.1 `autosave.ts`: debounce rules (2 s idle, 30 s max), ring of 3 per project and 10 projects, mesh references and garbage collection, storage failure handling. Test with fake timers and an in-memory store.
- [ ] 3.2 `recent.ts` and `fileAccess.ts`: recent list with thumbnail blobs and handles, permission re-request, fallbacks. Test with fakes for the file API.
- [ ] 3.3 `tabLock.ts`: `BroadcastChannel` per-project lock, take over. Test with a fake channel.
- [ ] 3.4 Save/open orchestration in a worker (`project.worker.ts`) with progress jobs of `31a`: save, open, thumbnail from the viewport. Test with the inline fallback.

## 4. Routes and entry

- [ ] 4.1 `routes.tsx`: `/` editor, `/editor` → `/`, `/generators` chooser, legacy and deep links unchanged, unknown → `/`; `lastSession` gets the editor. Test: every route and redirect, including all legacy paths of `app/routes.test`.
- [ ] 4.2 `StartOverlay` with Continue, New, Open, Recent, Import STL, generator cards (art from `39`), show/hide rules; `Header` logo link and product switcher; footer and beta notice text. Component tests; compare with the start page style at 390 px and desktop in en and ru (no artboard: built from `ui/` components and tokens).
- [ ] 4.3 `ProjectMenu` (New, Open, Save, Save As, Recent, local data), project name editing, unsaved marker, `beforeunload`, hotkeys (`Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+O`). `RestoreBanner` and the second-tab notice. Component tests for each action and prompt.
- [ ] 4.4 Local data panel (sizes, clear with confirmation). Test: sizes listed, clear removes only local data.

## 5. Generator round trip

- [ ] 5.1 `usePersistedState` `persistKey` override and a shared `useHandoff(mode)` hook (read the record, hold state under `<key>.handoff`, Back to editor bar). Test: the user's main key is never written during a handoff, return replaces the mesh and keeps the transform and stack, part-count change handled, cancel adds no history step.
- [ ] 5.2 Send to Editor / Edit in generator buttons in all generator modes (Box, Baseplate, Cutout, Keychain image/shape, Rack panel/case/shelf); disabled states with reasons. Component test per mode (rendering the button, the disabled reason) and one end-to-end test for baseplate.
- [ ] 5.3 Strings in `en.json` and `ru.json` for everything above (`project.*`, `autosave.*`, `start.editor.*`, `handoff.*`, log keys); key parity.

## 6. Documentation and version

- [ ] 6.1 README: the Editor as the main product, `.pkit` description, browser support table from the spike. `openspec/EDITOR.md`: mark the series as implemented where applicable.
- [ ] 6.2 Bump `package.json` to 2.0.0 and add `2.0.0 — 45-editor-project-default` to `CHANGELOG.md` noting the moved route. Test: `site.test.ts`.

## 7. Verification

- [ ] 7.1 `npm test` and `npm run build` are green, the dev server starts, no console errors; all generator deep links open as before with their saved settings.
- [ ] 7.2 In the browser, en and ru, desktop and 390 px, in Chrome and one non-Chromium browser: build a project (imported STL, sketch body, cut with connectors, fillets), save, reload, open the file in a fresh profile and compare bbox/volumes; kill the tab mid-edit and restore; open the same project in two tabs; send a baseplate to the editor, edit it in the generator and come back, check the generator's own saved settings are intact; load a hand-corrupted `.pkit` and a path-traversal archive and read the messages.
