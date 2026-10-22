# Design

## Context

`31a` adds the shared activity log with jobs (`generate`, and later `ai` and `model` jobs from `32`), the status bar line and the log panel. `32` adds the ML runtime (a worker running ONNX Runtime Web on WASM or WebGPU), the registry with the backend of each model, the model store (Cache API) and the model manager. The viewport draws with three.js on WebGL, on demand. The geometry runs in a Manifold WASM worker.

## What a page can and cannot know

Checked in Chrome 152 on Apple Silicon (the owner's device): `PressureObserver` with source `cpu`; `longtask` and `long-animation-frame` entry types; the WebGPU adapter with `timestamp-query`, `shader-f16` and `subgroups` and `adapter.info` (vendor `apple`, architecture `metal-3`); `EXT_disjoint_timer_query_webgl2`; `performance.memory`; `navigator.hardwareConcurrency` (10) and `deviceMemory` (16). Not available: `measureUserAgentSpecificMemory` (needs cross-origin isolation, which GitHub Pages does not give), any GPU or per-core CPU utilisation, VRAM, temperature. Firefox and Safari lack Compute Pressure, timer queries and `performance.memory`, so the view degrades to what the app itself measures.

## Goals / Non-Goals

**Goals:**
- For the two heavy cases (rebuild and draw of a model, AI run on WASM or WebGPU) show honest numbers with their provenance.
- Help the user choose a backend and a model, and understand a slow run.

**Non-Goals:**
- Real utilisation percentages, frame rate, automatic adaptation, telemetry.

## Decisions

- **Provenance on every value.** `ResourceValue = {value, unit, source: 'measured' | 'estimated' | 'unavailable', note?}`; the UI renders a small label and a tooltip ("estimated: threads × busy time"), and the copy text keeps them. A collector that the browser does not support returns `unavailable` with the reason; the view never hides a row silently.
- **Job accounting (all browsers).** `modelClient` and `mlClient` already know when a request starts and when its reply arrives; the jobs of `31a` carry `{start, end, backend, threads}` and the report is derived: duration, busy share of the worker over the job (busy time of the request over the wall time of the job, since a worker handles one request at a time) and, for WASM with `n` threads, an estimated core-equivalent load `busy × n` capped at `n` (labelled estimated: ORT's internal threads are not observable). For the editor: triangles of the result and the rebuild time.
- **Main thread.** A `PerformanceObserver` for `longtask` (and `long-animation-frame` where present) accumulates blocked time; the view shows "main thread blocked X % of the last 10 s" and the longest block, which tells whether the page stayed responsive while a job ran. Chrome and Edge only; elsewhere unavailable.
- **System CPU pressure.** `new PressureObserver(cb, {sampleInterval: 1000}).observe('cpu')` in secure contexts (HTTPS, localhost) shows the level and the time spent in each level during a job; it is a coarse, whole-system signal (the label says so) and is created only while the Resources view is open or a job runs, to avoid keeping an observer around.
- **GPU for AI on WebGPU.** The adapter's `info` and `limits` are read once (name, architecture, `maxBufferSize`). In diagnostics mode the runtime's WebGPU profiling (timestamp queries; ORT Web's `env.webgpu.profiling` with an `ondata` callback, to be verified against the pinned ORT version in task 1) accumulates kernel start and end times; the report shows the GPU time of the run and the five slowest kernels, and the ratio of GPU time to wall time. The profiling slows the run, so it is off by default; when the feature is missing the report says unavailable. GPU memory is an estimate: bytes of the weights plus the largest activations seen in the inputs and outputs of the model (labelled estimated), never a reading.
- **GPU for the editor render.** `renderer.info` (triangles, draw calls, geometries, textures) is exact. A timer query around the render (`EXT_disjoint_timer_query_webgl2`) gives the GPU time of the last draw where available (Chrome), read a few frames later and discarded when the disjoint flag is set; the CPU time to submit the draw is measured with `performance.now()`. Because the viewport renders on demand, these are "last render" values, not a running rate.
- **Memory.** `navigator.storage.estimate()` for the quota and the usage by the origin, with the model cache size taken from the model store; `performance.memory.usedJSHeapSize` where present; the byte length of the WASM memory of the modules we own when the runtime exposes it; the model manager of `32` shows the same cache numbers.
- **Diagnostics mode.** One persisted switch (`gridfinity.diagnostics`, key kept in the project's prefix), default off, that enables the costly collectors (kernel profiling, timer queries) and the continuous sampling of pressure and long tasks; its label says "slows down AI runs a little".
- **UI.** A "Resources" tab in the log panel of `31a`: groups CPU, GPU, Memory; a table "Last jobs" (what, backend, duration, busy share, GPU time when measured, triangles for rebuilds) taken from the job reports; values refresh once a second while a job runs and when the tab is opened; every number carries its provenance label; the browser support is summarised in one line ("Compute Pressure: not available in this browser"). On a phone the groups stack. The AI status line of `32` names the backend and threads ("WebGPU", "WASM ×4"). Copy of the log panel includes the resources report when the tab is shown.
- **Privacy.** Adapter name and architecture are shown to the user and included in the copied text only when the user presses Copy; nothing is sent anywhere, and no collector runs in the start pages.
- **Independent of the AI changes.** The job accounting, the viewport and memory parts work with `31a` alone; the GPU-for-AI part appears when `32` provides the runtime hook, so tasks are ordered to keep each part testable.

## Risks / Trade-offs

- [Proxies mistaken for utilisation] → provenance labels, no percentages unless measured, the wording "estimated" for core-equivalents and GPU memory.
- [Profiling changes what it measures] → diagnostics mode off by default, the label says it slows runs, kernel timing is aggregated per run.
- [APIs differ between browsers and versions] → each collector is feature-detected and returns `unavailable` with a reason; tests use fakes for both cases.
- [Observers leaking] → pressure and long-task observers exist only while needed and are disconnected on close; tested.
- [ORT's profiling hook changes between versions] → the ORT version is pinned in `32`; task 1 checks the hook on that version in the PoC before the work starts.

## Open Questions

- Whether to also offer a "benchmark" button that runs a fixed small inference on each backend and recommends one; left out of this change.
- Whether the AI status line should show GPU time live (needs profiling on); proposed only in the diagnostics mode.
