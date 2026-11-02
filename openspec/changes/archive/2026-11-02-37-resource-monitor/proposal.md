# Proposal

## Why

Two kinds of work in PrintKit are heavy: rebuilding and drawing a model in the editor (CSG in a WebAssembly worker, then a three.js render), and running a neural model in the browser (ONNX Runtime Web on WASM threads or on WebGPU). The user cannot tell what the machine is doing: whether a slow AI run is slow because of the WASM backend, because the GPU is busy, because the browser throttles, or because the model is simply big; whether a heavy model makes the editor sluggish; how much memory the loaded models take. The choice between WASM and WebGPU models (`32`) is made blind.

A web page cannot read the real load of the CPU or the GPU (there is no such API, on purpose). It can measure honest proxies for exactly these two cases, and label each as measured, estimated or unavailable. This change shows them.

## What Changes

- **A "Resources" view** in the activity log panel of `31a-status-log` (a tab next to the log) with three groups, CPU, GPU and Memory, plus the report of the last jobs. Each value says whether it is measured, estimated or not available in this browser. Nothing is shown as a percentage unless it is one.
- **Per-job report.** Every job of the log (model rebuild, AI run, model download) gets a short resource line when it ends: duration, backend (WASM threads or WebGPU), thread count, how much of the time the worker was busy, and for the editor the triangles drawn. The AI status line names the backend ("WebGPU", "WASM ×4").
- **CPU.** Worker busy share over the job (an estimate of load: threads × busy time), main-thread blocked time (long tasks) to say whether the page stayed responsive, and the system CPU pressure level (nominal, fair, serious, critical) where the browser offers it (Chrome and Edge). No per-core percentages.
- **GPU.** For AI on WebGPU, GPU time of the run from the runtime's profiling (timestamp queries) in a **diagnostics mode**, with the slowest kernels; the adapter's name and architecture; an estimate of the GPU memory a model needs (weights plus tensors). For the editor's render, the cost of a draw (triangles, draw calls, CPU submit time and, where the browser supports it, GPU time from a timer query). No GPU load percentage.
- **Memory.** Size of the model files in the cache and the browser's quota (`storage.estimate`), the JS heap where the browser reports it, the memory of the WASM modules we own when the runtime exposes it.
- **Diagnostics mode.** A switch, off by default, that turns on the profiling that costs speed (kernel timing, timer queries) and says so next to the switch.
- **No FPS.** The editor does not animate, so frame rate is not shown.
- **Local only.** All values stay on the device; the report is copied only when the user presses Copy.

## Capabilities

### New Capabilities
- `resource-monitor`: the resources view, per-job resource reports and the diagnostics mode.

### Modified Capabilities

## Impact

- New `src/app/resources/` (React-free collectors: `jobs.ts` busy accounting, `pressure.ts` Compute Pressure, `longTasks.ts`, `gpuInfo.ts`, `memory.ts`, `render.ts` for the viewport, a small `ResourceSnapshot` type with `measured | estimated | unavailable` per value), a `ResourcesTab` in the log panel of `31a`, the job interface of `31a` gets an optional `report` field, `modelClient` and `mlClient` report busy time and backend, the ML runtime of `32` gets an optional profiling hook, `Viewport` reports `renderer.info` and an optional timer query, strings in en and ru, tests.
- Out of scope: frame rate and anything about animation, real CPU or GPU load percentages (not available to a page), temperature, power and battery, per-process OS numbers, sending any measurement anywhere, adapting the app automatically to the load (choosing a model or a backend by itself), a benchmark suite.
- Version 1.8.0 (minor: a new capability).
- Depends on: `31a-status-log` (the log, jobs, status bar and panel), `32-photo-trace-ai` (the ML runtime, backends and model store), `29-beta-label` (the versioning rule).
