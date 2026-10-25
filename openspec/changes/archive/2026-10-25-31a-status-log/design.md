# Design

## Context

`MeasurementsBar` (in `features/viewport`) renders X, Y, Z of the model and, on the right, a spinner with "Generating…" when `busy` (from `useModel`, which sets it 200 ms after a request starts) or a check with "Ready". `Workspace` passes `busy` from each mode. There is no shared place to report anything else, and each feature shows its own banner.

## Goals / Non-Goals

**Goals:**
- One log for every part of the app, one place to look at it, the current line always visible.
- A small interface that features can call without knowing about the UI; the UI follows the interface language.

**Non-Goals:**
- Persistence, telemetry, a debugger.

## Decisions

- **Module store, not React state.** `activityLog.ts` is a module-level store (array of entries, a list of jobs, subscribers) read by `useSyncExternalStore`, so workers' clients, hooks and plain functions can write to it without a provider, and logging never re-renders unrelated components. The panel and the bar subscribe to it; tests reset it between cases.
- **Entries carry keys, not sentences.** `{id, time, level, source, key, params, detail?, job?}`; the UI renders `t(key, params)`, so changing the language re-renders old lines. `detail` is raw technical text of an exception (message or short stack) shown inside a collapsed "Details" element on that line, never as UI text. Time is stored as a timestamp and shown as `HH:MM:SS.mmm`.
- **Jobs.** `startJob({source, key, params, cancel?})` returns `{update({key, params, progress}), done(key, params), fail(key, params, detail), cancelled()}`. Updates replace the job's current line (and progress) in place; the log keeps the job's start, the notable milestones (`done`/`fail`/`cancelled` and anything the producer logs explicitly) and does not store every progress tick. A job that runs more than 200 ms drives the status bar loader, which replaces the `busy` prop of `Workspace`.
- **Status bar.** Left: X, Y, Z as now. Right: with a running job, the spinner and the job's current line, plus a Cancel button if the job has one; with none, the latest entry for 4 s, then "Ready" (with the check) when a model exists; counters `⚠ n` and `✕ n` of the entries since the last open or clear. The whole right part is one button (`aria-label` "Open the log"): click or Enter/Space opens the panel. The line is an `aria-live="polite"` region, throttled to one announcement per second so a download does not flood a screen reader. At 390 px the X/Y/Z shorten and the line truncates with an ellipsis; the counters stay.
- **Panel.** `ActivityLogPanel` is rendered once by `AppShell` and opened through a tiny store (`openLog({source?})`), so any component, such as the model manager, can open it filtered to a source. Desktop: a resizable panel above the status bar covering about 40 % of the viewport area; below 768 px a bottom sheet over the parameter drawer. Content: a virtualised-free list (at most 500 lines), time, level icon, source label, text, optional Details; sticky filters (level: all / warnings / errors; source chips with counts); auto-scroll to the newest line that pauses when the user scrolls up and resumes with a "Jump to latest" button; Copy (plain text: app version, language, user agent, then the lines) and Clear with no confirmation (the log is disposable); Esc and a close button, focus returns to the status bar button.
- **Retention.** A ring buffer of 500 entries; the oldest drop first; running jobs are never dropped. Memory only: a reload starts a clean log.
- **Producers in this change.** Only what exists today: (1) model generation in `useModel` and `useKeychainModel` (a `generate` job per rebuild: start, duration and triangle count on done, the validation error key and the warnings of the `ModelResult` as warning lines, a failure as an error with detail); (2) image decoding, mesh and font import (name, size, downscaled, failure); (3) storage: IndexedDB or Cache API unavailable and the memory fallback, as a warning once per session; (4) the photo dialog: sheet found or not (confidence, paper), straightened, silhouettes found (count, sizes), cutouts created; (5) export: format, printer, plates, parts that overflow, file built. The AI changes add `ai` and `model` sources later. A slider move is not logged; only the rebuild it triggers is, and consecutive rebuilds within a debounce window update one job.
- **Keys.** Every message has `log.<source>.<event>` keys in `en.json` and `ru.json`; the existing parity test covers them.
- **Privacy.** Entries never hold pixels, file contents or URLs of user files; names and sizes only; the Copy text states that it stays on the device. No network call is made by the log.
- **Compatibility.** The `busy` prop of `Workspace` and `MeasurementsBar` stays accepted for one change as an override that is ignored when jobs report; the modes switch to jobs in this change and the prop is removed in the same change (a task), since nothing outside the app uses it.

## Risks / Trade-offs

- [Log noise from frequent rebuilds] → jobs coalesce within the debounce window, progress updates are in place, a ring buffer bounds memory.
- [Screen reader flooding] → one polite announcement per second, only the status line is live, not the panel.
- [Duplicate sources of truth for "generating"] → the loader is derived from jobs only; tests check that no mode passes its own busy flag.
- [Technical detail shown in a non-translated language] → only inside "Details"; the line itself is a translated sentence.

## Open Questions

- Whether warnings from validation (`rack.error.*`, `baseplate.error.*`) should also keep their banners (yes for now: the banner is the call to action, the log is the record).
