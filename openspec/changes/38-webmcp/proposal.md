# Proposal

## Why

Browsers are getting agents (Chrome with Gemini, extensions, assistants) that act on a page for the user. Today such an agent has to read the DOM and click: slow, fragile, and blind to what is valid (it does not know that a 5-unit-wide rack case exceeds 222.25 mm until the page shows an error). WebMCP is a web-platform proposal (W3C community group; early preview in Chrome) in which a page declares **tools**, each with a name, description, JSON input schema and an `execute` function, and the agent calls them directly.

PrintKit is a good fit: it is client-only, every mode is a pure function of a small serialisable parameter object in millimetres, validation already returns keys instead of text, and the result (volume, bounding box, plate arrangement) is measurable without looking at the screen. "Baseplate 4×3 with corner magnets for a Bambu A1, give me the 3MF" becomes a few calls with real validation feedback.

The API is still moving (the entry point is `document.modelContext` in current Chrome docs and was `navigator.modelContext` in the first preview; annotations and argument shapes change between versions). This change therefore isolates the API behind one thin adapter and does nothing at all when the browser has no WebMCP.

## What Changes

- **Agent bridge** (`src/agent/`): a React-free registry of *tools* (name, description, JSON schema, read-only/consequential flags, handler) and an adapter that registers them with the browser's WebMCP when it exists, re-registers when the active mode changes (`toolchange`), and removes them on unmount. No WebMCP → nothing is registered and nothing changes for the user.
- **Tools, always present:** `get_app_state` (product, mode, units, language, what is writable), `open_mode` (navigate to a product/mode), `get_export_settings`, `set_export_settings`.
- **Tools, per active mode:**
  - `get_parameters` (current parameters in mm, the schema of the writable subset, defaults);
  - `set_parameters` (a partial patch, deep-merged, validated against the mode's schema and normalised by the mode's own `migrate`, applied atomically; returns the validation keys with English texts and the new state, or the reasons it was rejected, without changing anything);
  - `reset_parameters` (asks the user to confirm in the UI);
  - `get_model_info` (waits for the build to settle: parts, bounding box, volume, triangles, validation errors and warnings, plate arrangement and overflow for the current printer);
  - `request_export` (does not download by itself: opens a confirmation in the page, the file is saved only when the user presses Download).
- **Writable modes in this version:** Gridfinity baseplate and box, Rack panel, case and shelf, Keychain shape. **Read-only (state, info, export):** Gridfinity cutout and Keychain image (they depend on files the user chose, which an agent cannot supply), and anything AI (`32`–`34`).
- **Agent activity is visible and reversible.** Every call is written to the activity log of `31a` ("Agent: set_parameters baseplate.x = 4 units"), the status bar shows a short "Agent" marker while a call runs, and the last 10 agent changes can be undone one by one from the log line or the panel ("Undo agent change").
- **A switch** "Allow browser agents" (Header menu or the log panel, persisted, default on) that unregisters everything when off.
- **Safety.** Tools expose only the parameters of the current mode and the export settings: never images, photos, meshes, model files, file names of the user's disk, or storage contents. Tool results are plain data, never instructions. Parameters that hold user text (Keychain text, file name) are marked untrusted in the annotations.
- **No new dependency, no network.** The schema check is a small local validator; nothing is sent anywhere by this change.

## Capabilities

### New Capabilities
- `webmcp`: tools for browser agents, the agent bridge, activity log entries, undo and the switch.

### Modified Capabilities

## Impact

- New `src/agent/` (`registry.ts`, `webmcp.ts` adapter, `schema.ts` validator, `patch.ts` deep merge, `tools/{app,params,model,export}.ts`, per-mode descriptors `modes/*.ts` with schema + normalise + validate, `history.ts` undo stack), an `AgentHost` mounted in `AppShell`, a small hook `useAgentMode(descriptor, state, setState, model)` called by each writable mode, a "Allow browser agents" switch and an undo control in the log panel of `31a`, an export confirmation dialog, strings in en and ru, tests.
- Modes keep ownership of their state: the bridge calls the same setters and the same `migrate` and `validate*` functions the UI uses; geometry is untouched.
- Out of scope: tools for images, photos, STL import, fonts and AI models; running or managing AI from an agent; reading or writing the mesh store; cross-origin exposure of tools (`exposedTo`); the declarative (form attribute) WebMCP API; any server side; adapting to a particular agent product.
- Version 1.9.0 (minor: a new capability).
- Depends on: `31a-status-log` (agent entries in the log, status marker), `29-beta-label` (the versioning rule). Independent of `32`–`37`, but the tools never download models and never start AI, so they stay valid when those land.
