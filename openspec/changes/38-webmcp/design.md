# Design

## Context

Each mode owns its state through `usePersistedState(key, defaults, migrate)` and builds its model with `useModel(mode, params, {enabled})` (debounce 150 ms, `busy`, `pending`, last good mesh kept). Validation is pure (`validateBaseplate`, `validateBox`, `validateRackPanel`, `rackCaseLayout` errors, …) and returns i18n keys. Export settings are a module store (`useExportSettings()`, key `gridfinity.export`) and `buildExport(parts, settings, name)` is pure. The activity log of `31a` takes entries and jobs.

WebMCP (state of the art when this was planned, checked against the Chrome documentation): `document.modelContext.registerTool({name, description, inputSchema, execute(input, {signal}), annotations})` with annotations `readOnlyHint`, `untrustedContentHint`, `consequentialHint` (all default false); unregistering by an `AbortSignal` passed at registration; `getTools()`, `executeTool()` and a `toolchange` event for discovery and testing; cross-origin exposure is opt-in. The first preview used `navigator.modelContext`. Return shape and feature detection are not formally documented, and early-preview behaviour needs Chrome flags or an origin trial.

## Goals / Non-Goals

**Goals:**
- Let a browser agent configure any writable mode and read the result with real validation, without touching the DOM.
- Never do anything the user did not see or cannot undo; never download silently.
- Survive API churn: one adapter file knows the browser API.

**Non-Goals:**
- Agents driving images, files, fonts, AI; server-side MCP; supporting every agent product.

## Decisions

- **One adapter, many tools.** `agent/registry.ts` is the product-level model: `AgentTool = {name, description, inputSchema, annotations, run(input, ctx): Promise<ToolResult>}`; `ToolResult` is `{ok: true, data} | {ok: false, error: {code, message, details?}}`. `agent/webmcp.ts` is the only place that touches `document.modelContext` (falling back to `navigator.modelContext` while Chrome still has it): feature detection, `registerTool` with an `AbortController` per tool, converting a `ToolResult` to the shape the browser expects (a JSON text content; the exact shape is fixed by the spike), `toolchange`, and `dispose()`. If neither object exists, `webmcp.install()` returns `null` and the host renders nothing. Everything else is testable in Node with a fake `modelContext`.
- **Tools follow the active mode.** `AgentHost` (in `AppShell`) holds the always-present tools and the set contributed by the mounted mode. A mode contributes by calling `useAgentMode(descriptor, {state, setState, model, defaults})`; unmount removes its tools. The names do not carry the mode (`set_parameters`, not `set_baseplate_parameters`): the active mode is in `get_app_state`, and fewer tools make agents more reliable. A tool called while no mode is open answers `no_active_mode` with the list of modes and `open_mode`.
- **Descriptor per mode.** `AgentModeDescriptor<T> = {id, writable, schema, normalise(raw) → T, validate(T) → keys, describe(T) → data}`. `schema` is a JSON Schema subset (object, number with min/max/step, integer, boolean, string enum, array with max items) written by hand for the documented fields only, with descriptions in English that include units ("mm", "cells"). `normalise` is the mode's existing `migrate` plus the same nested normalisers as `usePersistedState` (so a partial patch can never crash a mode); `validate` is the mode's existing validator. Fields not in the schema are not writable: this keeps files, images and internal ids out of reach.
- **Patch semantics.** `set_parameters({patch})`: (1) check the patch against the schema (unknown field, wrong type, out of range → error with the JSON path, nothing applied); (2) deep-merge onto the current state (arrays replaced whole, `AxisSize` objects merged by key); (3) `normalise`; (4) `validate`: validation keys are *returned* but the state **is** still applied when the keys are the mode's ordinary "invalid parameters" (the UI shows them the same way and generation is skipped), so the user sees what the agent did; hard schema violations are never applied; (5) one `setState` call, so one rebuild; (6) the result carries `applied`, `normalised` differences (e.g. a value clamped), `errors` (keys + English text from `en.json`) and `warnings`. Lengths are millimetres whatever the display unit.
- **Reading the result.** `get_model_info` waits for `!pending && !busy` with a 20 s limit and returns `{ready, parts: [{label, bbox, volumeMm3, triangles}], total, errors, warnings, plate: {printer, usableBed, plates, overflow}}`; it never returns the mesh. If the build is still running at the limit it answers `ready: false` and the caller may retry.
- **Export is a request, not an action.** `request_export({format?, name?})` validates (nothing to export, errors) and opens an `AgentExportDialog` ("An agent wants to save <file list, sizes>"), whose Download button runs the normal export path. The tool resolves when the user chooses or the dialog is dismissed (`saved | declined | timeout 120 s`), so an agent cannot download in the background and a hidden tab cannot save files. `reset_parameters` uses the same confirmation. This matches the rule of `32` (nothing is downloaded silently).
- **Log and undo.** Each call writes a log entry through the `31a` API with source `agent`, tool name and a short human summary built from the patch paths (not the whole object). `agent/history.ts` keeps the last 10 `{label, before, after}` snapshots of mode state per mode; "Undo agent change" restores `before` through the same `setState` (only if the current state still equals `after`, otherwise it offers to restore anyway). The status bar marker is the `31a` job type `agent` while a call runs.
- **Switch.** `gridfinity.agent` = `{enabled: true}`; off → `dispose()`; on → reinstall. The switch sits in the log panel header (where agent activity is visible) and the Header menu link opens it. The state is read at startup before registering.
- **Security.** Tool results contain only numbers, enums, booleans, parameter names, validation texts that we wrote, and user-entered strings of writable modes (Keychain text, export file name), the tools returning the last are annotated `untrustedContentHint`. Tool descriptions are static. Nothing in the page is executed from tool input, a string never reaches `innerHTML` or a file path unsanitised (the export name goes through the existing file-name normalisation). `exposedTo` is never set, so other origins' frames cannot call the tools. Inputs are size-limited (a patch over 8 KB is rejected). A call rate over 20 per second answers `rate_limited`.
- **Stability.** The adapter reads the flavour of the API at runtime (`document.modelContext` first), tolerates both argument shapes for `execute`, and everything is behind `webmcp.install()` returning `null`. The spike (task 1.1) pins what the current Chrome does; a version change of the browser API means editing one file.

## Tool surface (v1)

| Tool | Flags | Purpose |
|---|---|---|
| `get_app_state` | readOnly | product, mode, units, language, writable modes, which tools exist |
| `open_mode` | – | navigate to `{product, mode}` (hash route); unknown → error with valid ids |
| `get_parameters` | readOnly, untrusted | current parameters (mm), schema of the writable subset, defaults |
| `set_parameters` | consequential | patch, validate, apply; returns errors, warnings, normalised diff |
| `reset_parameters` | consequential | asks the user to confirm, then restores defaults |
| `get_model_info` | readOnly | build result summary and plate status |
| `get_export_settings` | readOnly | format, printer, margin, gap, multi, orientation, file name |
| `set_export_settings` | consequential | patch of the same fields (printer ids from `data/printers.ts`) |
| `request_export` | consequential | ask the user to save; resolves with `saved/declined/timeout` |

## Risks / Trade-offs

- The API may change or never leave preview → one adapter, no effect without it, a small change if it moves; the value now is mostly agent-driven testing and an early look.
- An agent can leave a mode in an invalid state → validation keys are returned and shown, undo is one click, the model keeps the last good mesh.
- A per-mode schema can drift from the UI → each descriptor has a test that the schema and defaults agree, and a test that every writable setting of a panel is either in the schema or listed as excluded.

## Open Questions

- Spike results go here: exact API name and flag in the current Chrome, the shape `execute` must return, whether images can be returned (a `capture_view` tool for the 3D view is deferred until they can), how to drive the tools in tests (the browser's `executeTool`), and whether a hidden tab keeps tools registered.
