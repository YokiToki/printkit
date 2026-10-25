# Spec Delta

## Purpose
Defines the resources view that shows, with honest labels, how the heavy work of the app, rebuilding and drawing a model and running AI models on WASM or WebGPU, uses the processor, the graphics card and the memory.

## ADDED Requirements

### Requirement: Resources view
The log panel SHALL have a Resources view with groups for the processor, the graphics card and the memory, and a list of the last jobs with what they were, the backend, the duration and their resource figures. The view SHALL refresh while a job runs and when it is opened. It SHALL NOT show the frame rate.

#### Scenario: Open
- **WHEN** the user opens the log panel and chooses Resources
- **THEN** the processor, graphics and memory groups and the list of recent jobs are shown

#### Scenario: Live while a job runs
- **WHEN** an AI run is in progress and the view is open
- **THEN** its values are refreshed about once a second

#### Scenario: Recent jobs
- **WHEN** a model has been rebuilt and an AI run has finished
- **THEN** each appears in the list with its duration and backend, and the rebuild with its triangle count

### Requirement: Honest figures
Every value in the view SHALL say whether it was measured, estimated or is not available in this browser, with a short reason for the last two. A value SHALL NOT be shown as a percentage of the processor or of the graphics card unless it is one that was measured. A source that the browser does not offer SHALL be listed as not available, not left out.

#### Scenario: Measured and estimated
- **WHEN** the busy share of a WASM run with four threads is shown
- **THEN** it is labelled as an estimate and its tooltip says how it was derived

#### Scenario: Not available
- **WHEN** the browser has no Compute Pressure
- **THEN** the system pressure row says that it is not available in this browser

#### Scenario: No invented load
- **WHEN** the view is shown on any browser
- **THEN** it does not show a CPU or GPU load percentage that was not measured

### Requirement: Job resource report
Every model rebuild, AI run and model download SHALL end with a short resource report in the activity log: its duration, the backend (WASM with its number of threads, or WebGPU), how much of the time the worker was busy, and for a rebuild the number of triangles. The AI status line SHALL name the backend and the number of threads.

#### Scenario: Rebuild report
- **WHEN** a model rebuild ends
- **THEN** the log line shows how long it took and how many triangles the result has

#### Scenario: AI report
- **WHEN** an AI run on WebGPU ends
- **THEN** the log line shows the duration and that the backend was WebGPU

#### Scenario: Backend in the status line
- **WHEN** an AI run on WASM with four threads is in progress
- **THEN** its status line names WASM and four threads

### Requirement: Processor figures
The view SHALL show, for the processor, the busy share of the worker over a job (an estimate of the load, counted with the number of threads), the time the main thread was blocked and the longest block, so the user can tell whether the page stayed responsive, and, where the browser offers it, the system's processor pressure level and the time spent at each level during a job, labelled as a whole-system signal.

#### Scenario: Responsiveness
- **WHEN** a job has run for a while
- **THEN** the view shows how much of the last seconds the main thread was blocked and the longest block

#### Scenario: System pressure
- **WHEN** the browser offers processor pressure and a job runs
- **THEN** the current level is shown and labelled as concerning the whole computer

### Requirement: Graphics figures
For an AI run on WebGPU the view SHALL show the adapter's name and architecture and an estimate of the graphics memory the model needs; in diagnostics mode, where the browser supports timestamp queries, it SHALL also show the GPU time of the run, its share of the run's duration and the five slowest kernels. For the editor's drawing it SHALL show the number of triangles and draw calls of the last render, the time to submit it and, where the browser supports a timer query, the GPU time of the last render.

#### Scenario: Adapter
- **WHEN** WebGPU is used
- **THEN** the view shows the adapter's name and architecture, and the memory figure is labelled as an estimate

#### Scenario: GPU time of a run
- **WHEN** diagnostics mode is on, the browser supports timestamp queries and an AI run on WebGPU finishes
- **THEN** the report shows the GPU time and the slowest kernels

#### Scenario: Last render
- **WHEN** the editor shows a model
- **THEN** the view shows the triangles and draw calls of its last render and the time it took to submit

#### Scenario: Unsupported
- **WHEN** the browser does not support timestamp queries or timer queries
- **THEN** the corresponding rows are listed as not available

### Requirement: Memory figures
The view SHALL show the space taken by the downloaded models in the browser's storage and the storage quota, the JavaScript heap where the browser reports it, and the memory of the WebAssembly modules when the runtime exposes it.

#### Scenario: Storage
- **WHEN** two models are downloaded
- **THEN** the view shows the space they take and the quota of the browser's storage

#### Scenario: Heap
- **WHEN** the browser reports the JavaScript heap
- **THEN** it is shown, and otherwise listed as not available

### Requirement: Diagnostics mode
The costly measurements, kernel timing of WebGPU runs and timer queries, SHALL run only when the user turns on a diagnostics switch, which SHALL be off by default, SHALL say that it slows runs down a little, and SHALL be remembered. With it off the view SHALL still show the measurements that cost nothing.

#### Scenario: Off by default
- **WHEN** the app is opened for the first time
- **THEN** diagnostics mode is off and no profiling runs

#### Scenario: Warned
- **WHEN** the user looks at the diagnostics switch
- **THEN** its label says that turning it on slows AI runs a little

#### Scenario: Remembered
- **WHEN** the user turns diagnostics on and reloads
- **THEN** it is still on

### Requirement: Local only and tidy
All figures SHALL stay on the device and SHALL be copied only when the user presses Copy. Observers and queries SHALL run only while the view is open or a job is running and SHALL be released afterwards. Nothing SHALL run on the start pages.

#### Scenario: No network
- **WHEN** the view is used
- **THEN** no network request carries any measurement

#### Scenario: Released
- **WHEN** the view is closed and no job is running
- **THEN** the pressure and long-task observers are disconnected

### Requirement: Language
All text of the view, the labels, the reasons and the report lines SHALL be available in every language of the app.

#### Scenario: Russian
- **WHEN** the interface language is Russian
- **THEN** the groups, labels, reasons and job reports are in Russian
