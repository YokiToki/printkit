# Proposal

## Why

The status bar under the 3D view (`MeasurementsBar`) shows the model's X, Y and Z and one indicator, "Generating…" or "Ready". That is all the app says about what it is doing. When a model does not appear, the reason is a banner or nothing; photo processing, image import, storage fallbacks and export have no visible trace; and the planned AI features (`32`–`34`) add long jobs (downloading a model, a run of several passes) that need a visible "what is happening now" and a place to read the whole story afterwards.

Instead of a log hidden in one feature (the model manager), the status bar becomes a general, independent activity log of the whole app: one current line at a glance, and the full log one click away.

## What Changes

- **A shared activity log.** An app-level, memory-only log with levels (info, warning, error), a source (model generation, photo, image, storage, export, AI, app) and a text that follows the interface language. Long work is a *job* with a state, an optional progress and a Cancel; progress updates change the job's line in place instead of adding lines.
- **The status bar shows the activity.** X, Y and Z stay on the left. On the right a loader and the **current line** (the latest line of the running job, otherwise the last message for a few seconds, then "Ready"), with small counters of warnings and errors. Clicking it, or pressing Enter, opens the log.
- **The log panel.** Opens above the status bar (a bottom sheet on a phone): every line with time, level and source, filters by level and by source, Copy (plain text with the app version and language) and Clear, closes with Esc. It is reachable from anywhere that links to it, such as the "AI models" manager, not only from the status bar.
- **Existing work reports to it.** Model generation (start, duration, triangle count, validation errors and warnings with their messages, failures), image and font import, storage fallbacks (IndexedDB or Cache API unavailable), the photo dialog (sheet found, straightened, silhouettes found, cutouts created) and export (file built, plates, parts that do not fit). The AI changes (`32`–`34`) report through the same interface.
- **Not a telemetry.** The log lives in memory of the tab, holds names and sizes but never image data, and is never sent anywhere.

## Capabilities

### New Capabilities
- `activity-log`: the shared activity log, its status bar line and its panel.

### Modified Capabilities

## Impact

- New `src/app/activityLog.ts` (store, `log.info/warn/error`, `startJob`, `useActivityLog` via `useSyncExternalStore`), `features/viewport/StatusBar.tsx` replacing the right part of `MeasurementsBar` (the X/Y/Z part stays), `app/ActivityLogPanel.tsx` rendered by `AppShell`; `useModel`, `useKeychainModel`, `imageStore`, `fontStore`, the photo dialog hook and the export panel emit events; the `busy` prop of `Workspace` is replaced by the job state; strings in en and ru; tests (the store, the line, the panel, producers, key parity, accessibility).
- Out of scope: persistence of the log across reloads, sending it anywhere or any telemetry, logging every slider move or render frame, a profiler, the AI events themselves (added by `32`–`34` through this interface), the Gridfinity or Rack calculations beyond their generation result.
- Version 1.3.0 (minor: a new capability).
- Depends on: `29-beta-label` (the versioning rule); `31-rack-shelf` is already archived.
