# Tasks

## 1. Check on the owner's device (spike)

- [ ] 1.1 Extend the PoC (`poc/ai/`) with a throwaway resources panel that, for the AI models of the shortlist on WASM (1 and 4 threads) and on WebGPU, records: wall time, worker busy share, long-task blocked time, Compute Pressure levels, `adapter.info`, and with ORT Web's WebGPU profiling on the pinned version the GPU time and the slowest kernels, compared with the wall time; also the cost of the profiling (run time with and without it) and `renderer.info` plus a timer query for the keychain and cutout 3D views. Record the numbers and what is not available in `poc/ai/FINDINGS.md` and in `design.md` (Open Questions). If the profiling hook is not usable on the pinned version, say so and stop for `/opsx:update`.

## 2. Collectors (React-free)

- [ ] 2.1 `app/resources/types.ts` (`ResourceValue` with `measured | estimated | unavailable` and a note) and `app/resources/jobs.ts`: the report of a job from its start, end, backend and threads (duration, worker busy share, estimated core-equivalent `busy × threads` capped at the threads, triangles for a rebuild). Tests: a single-request job gives busy share 1, two requests with a gap give the right share, the core-equivalent is capped, an unknown backend is reported as such, values carry their provenance.
- [ ] 2.2 `longTasks.ts` (blocked time over a window and the longest block from `longtask` and `long-animation-frame`), `pressure.ts` (`PressureObserver` for `cpu`, time per level), `gpuInfo.ts` (adapter name, architecture, limits), `memory.ts` (`storage.estimate`, `performance.memory`, model cache size from the model store of `32`), each feature-detected and returning `unavailable` with a reason. Tests with fakes for the supported and the unsupported browser, observers are disconnected on `stop()`, no collector runs before `start()`.
- [ ] 2.3 GPU time: the profiling hook of the ML runtime of `32` (kernel start and end accumulated per run, five slowest kernels, ratio to wall time) enabled only in diagnostics mode, and the viewport's `render.ts` (`renderer.info`, submit time, optional `EXT_disjoint_timer_query_webgl2` with the disjoint check). Tests: the kernel aggregation on a recorded sample, profiling is off unless diagnostics is on, a disjoint timer result is discarded, the unsupported case is reported.

## 3. Integration

- [ ] 3.1 Job reports in the log of `31a`: `modelClient` and `mlClient` report start, end, backend and threads; a finished job writes its resource line; the AI status line of `32` names the backend and threads. Tests: a fake rebuild and a fake AI run produce the lines with duration, backend and (for rebuilds) triangles, the status line shows "WASM ×4" and "WebGPU", English and Russian keys.

## 4. UI

- [ ] 4.1 `ResourcesTab` in the log panel of `31a`: groups CPU, GPU and Memory, the table of the last jobs, a provenance label with a tooltip on every value, a one-line browser support summary, the diagnostics switch with its warning, refresh once a second while a job runs and when opened, collectors started on open and stopped on close, stacked groups on a phone, the resources report included in Copy. Strings in `en.json` and `ru.json`. No artboard exists: built from `ui/` components and `theme.css` tokens, said in the commit; compare in en and ru and at 390 px. Component tests: every value shows a label, an unsupported source is listed as not available, no percentage appears for estimated values, the switch persists in `gridfinity.diagnostics`, observers are disconnected on close, Copy contains the report, key parity.

## 5. Version

- [ ] 5.1 Bump to 1.8.0: `package.json` and a `CHANGELOG.md` entry `1.8.0 — 37-resource-monitor`. Test: the existing version test passes with the new number.

## 6. Verification

- [ ] 6.1 `npm test` and `npm run build` are green, the dev server starts, no console errors.
- [ ] 6.2 In the browser, en and ru and at 390 px: rebuild a heavy model and run an AI model on WASM and on WebGPU, check the Resources view shows the durations, the backend, the busy share labelled as an estimate, the blocked main-thread time, the pressure level where Chrome offers it, the adapter, the triangles and draw calls of the last render; turn diagnostics on and see the GPU time and the slowest kernels on WebGPU and the note that runs are slower; check Safari or Firefox (if available) lists the unsupported rows as not available; no network request carries a measurement; the observers stop when the view is closed.
