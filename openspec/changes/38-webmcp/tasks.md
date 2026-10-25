# Tasks

## 1. Check the browser API (spike)

- [ ] 1.1 In a throwaway page (or a branch of `poc/`) in the owner's Chrome, register one read-only and one writing tool and drive them with the browser's own `getTools()` / `executeTool()` and with a real agent if one is available. Record in `design.md` (Open Questions): the entry point (`document.modelContext` / `navigator.modelContext`), the flag or origin trial, the shape `execute` must return and how errors are returned, `AbortSignal` unregistering, `toolchange`, whether a background tab keeps the tools, whether images can be returned, and the Chrome version. If the API cannot be used on a normal build, stop for `/opsx:update`.

## 2. Agent core (React-free)

- [ ] 2.1 `agent/registry.ts` (`AgentTool`, `ToolResult`, error codes), `agent/schema.ts` (JSON-Schema subset validator returning JSON paths: object, number min/max, integer, boolean, enum, array with max items, size limit) and `agent/patch.ts` (deep merge, arrays replaced, the diff of normalisation). Tests: valid, unknown field, wrong type, out of range, oversized, arrays, merge of nested objects, diff reporting.
- [ ] 2.2 `agent/webmcp.ts`: feature detection, registration with an `AbortController` per tool, result conversion as fixed by the spike, `toolchange`, `dispose()`, call rate limit. Tests with a fake `modelContext` (both entry points): no API → `install()` is `null` and nothing throws; tools registered and removed; a thrown handler becomes an error result; rate limit.
- [ ] 2.3 `agent/history.ts`: per-mode stack of the last 10 `{label, before, after}`, undo, the changed-since check. Tests.

## 3. Descriptors and tools

- [ ] 3.1 Descriptors for the writable modes (`agent/modes/{baseplate,box,rackPanel,rackCase,rackShelf,keychainShape}.ts`): schema of the documented fields with unit descriptions, `normalise` (the mode's migrate), `validate`, `describe`. Tests per mode: defaults satisfy the schema, a patch round-trips through `normalise`, invalid sizes give the same keys as the validator, and a coverage test that every setting of the panel is in the schema or in an explicit exclusion list.
- [ ] 3.2 Tools: `get_app_state`, `open_mode`, `get_parameters`, `set_parameters`, `reset_parameters`, `get_model_info`, `get_export_settings`, `set_export_settings`, `request_export`. Tests with fake mode handles: unknown mode, read-only modes, patch rejected leaves state unchanged, invalid-but-applied returns keys with English texts, `get_model_info` waits for `pending`, times out with `ready: false`, never returns mesh data, printer ids checked, export file name normalised, lengths in mm regardless of unit.

## 4. App integration

- [ ] 4.1 `useAgentMode(descriptor, handle)` and `AgentHost` in `AppShell` (tool set follows the mounted mode); each writable mode calls the hook with its state, setter, defaults and model result; the read-only modes call it with `writable: false`. Tests: mounting a mode adds its tools, switching modes swaps them, unmount removes them, a tool called during a route change answers `no_active_mode`.
- [ ] 4.2 Activity log entries and the status marker through the API of `31a` (source `agent`, a summary built from the changed paths), the "Undo agent change" control in the log line and panel, the switch "Allow browser agents" (key `gridfinity.agent`) in the log panel header with its Header-menu entry. Strings in `en.json` and `ru.json`. No artboard exists: built from `ui/` and tokens, said in the commit. Component tests: log entry text, undo restores, changed-since prompt, switch persists and unregisters, key parity.
- [ ] 4.3 `AgentExportDialog` and the reset confirmation (`ConfirmDialog`): file list and sizes, Download runs the normal export, decline and the 120 s timeout resolve the call, one dialog at a time, focus handling and Esc. Tests: saved / declined / timeout, no download without a click, nothing opens when the model has errors.

## 5. Version

- [ ] 5.1 Bump to 1.9.0: `package.json` and a `CHANGELOG.md` entry `1.9.0 — 38-webmcp`. Test: the existing version test passes with the new number.

## 6. Verification

- [ ] 6.1 `npm test` and `npm run build` are green, the dev server starts, no console errors; in a browser without WebMCP the app behaves as before.
- [ ] 6.2 In Chrome with WebMCP enabled, en and ru: list the tools, change a baseplate (size, fasteners), a box, a rack case that becomes too wide (see the error in the panel), a keychain shape; check `get_model_info` against the STL bounding box and volume of the real export; ask for an export and confirm, decline and let it time out; undo an agent change; turn the switch off and check the tools disappear; check no tool returns images or file data and no network request is made by the tools.
