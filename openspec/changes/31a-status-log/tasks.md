# Tasks

## 1. Store and interface

- [ ] 1.1 `app/activityLog.ts`: the store (entries, jobs, subscribers), `log.info/warn/error(source, key, params?, detail?)`, `startJob(...)` with `update / done / fail / cancelled`, a ring buffer of 500 entries that never drops a running job, `useActivityLog` via `useSyncExternalStore`, `openLog({source?})` and its state, a reset for tests. Tests: entries keep keys and params, progress updates change the job's line in place without adding lines, the buffer drops the oldest finished entries and keeps a running job, the loader state follows jobs longer than 200 ms, `cancelled` and `fail` set the state, subscribers are notified once per change.

## 2. Status bar and panel

- [ ] 2.1 `StatusBar` replacing the right part of `MeasurementsBar` (X, Y, Z stay): loader and the current line of the running job with Cancel, the latest message for 4 s then "Ready", counters of warnings and errors, one button that opens the log, a polite live region throttled to one announcement a second, truncation at 390 px; the `busy` prop of `Workspace` and the modes is removed in favour of jobs. Strings in `en.json` and `ru.json`. No artboard exists: built from `ui/` components and `theme.css` tokens, said in the commit; compare in en and ru and at 390 px. Component tests: the line follows a fake job, "Ready" after the message delay, counters, Enter and click open the panel, Cancel calls the job, the live region announces at most once a second, no mode passes its own busy flag.
- [ ] 2.2 `ActivityLogPanel` rendered by `AppShell`: list of entries with time, level, source and text, filters by level and by source with counts, follow and "Jump to latest", Details of a line, Copy (header with version, language, browser) and Clear, Esc and a close button with focus return, a bottom sheet below 768 px, openable from any page through `openLog({source})`. Component tests: filters, following and pausing on scroll, Copy writes the expected text, Clear resets the counters, Esc closes and returns the focus, opening with a source preselects it, the language switch re-renders old lines, key parity.

## 3. Producers

- [ ] 3.1 Model generation: `useModel` and `useKeychainModel` run one `generate` job per rebuild (rebuilds within the debounce are one job), report the duration and triangles on done, the validation key and warnings of the `ModelResult` as warning lines, a failure as an error with details. Tests: one job per debounced rebuild, the warning and error lines appear with their keys, a failed build keeps the previous mesh and logs the error.
- [ ] 3.2 Import, storage, photo and export: image, mesh and font import (name, size, downscaled, failure), the memory fallback of `imageStore`, `meshStore` and `fontStore` (a warning once per session), the photo dialog steps (sheet found with the confidence and paper, straightened, silhouettes found with sizes, cutouts created), export (format, printer, plates, overflow, files built). Tests: each producer emits its lines with the right source and level, the storage warning is logged once, no line holds pixels or file contents.

## 4. Version

- [ ] 4.1 Bump to 1.3.0: `package.json` and a `CHANGELOG.md` entry `1.3.0 — 31a-status-log`. Test: the existing version test passes with the new number.

## 5. Verification

- [ ] 5.1 `npm test` and `npm run build` are green, the dev server starts, no console errors.
- [ ] 5.2 In the browser, en and ru and at 390 px, in Box, Keychain and Cutout: the status bar shows "Generating…" lines while a model is built and "Ready" after, the log lists the generations with durations, an invalid parameter shows a warning with its message, importing an image and exporting a file are logged, the log opens by click and by keyboard, filters, Copy and Clear work, Esc returns the focus, a reload clears the log, nothing is sent to the network.
