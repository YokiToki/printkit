# Spec Delta

## Purpose
Defines how PrintKit exposes its parametric tools to browser agents through WebMCP, with visible, reversible and consent-based actions.

## ADDED Requirements

### Requirement: Registration only where the browser supports it
The app SHALL register its tools with the browser's WebMCP interface when the browser provides one, and SHALL do nothing, without errors or visible changes, when it does not. All knowledge of the browser API SHALL be in one adapter.

#### Scenario: Supported browser
- **WHEN** the app starts in a browser with WebMCP and agents are allowed
- **THEN** the always-present tools are registered, and the tools of the open mode are added

#### Scenario: Unsupported browser
- **WHEN** the browser has no WebMCP interface
- **THEN** no tool is registered, no error is logged, and the app behaves as before

#### Scenario: Mode changes
- **WHEN** the user moves from one mode to another
- **THEN** the tools of the old mode are removed and those of the new mode registered, and the tool list change is announced to the browser

### Requirement: Reading the app and the mode
The tools SHALL let an agent read the product, the mode, the units, the language, the writable modes, the current parameters in millimetres with their schema and defaults, and the export settings. They SHALL NOT return images, photos, meshes, model files, stored model data or the contents of browser storage.

#### Scenario: App state
- **WHEN** an agent calls `get_app_state` in the Rack case mode
- **THEN** it receives the product and mode, whether the mode is writable and the list of tools available

#### Scenario: Parameters in millimetres
- **WHEN** the user's display unit is inches and an agent calls `get_parameters`
- **THEN** all lengths are returned in millimetres, with the unit named in the schema

#### Scenario: No tool in a read-only mode for writing
- **WHEN** the open mode is Gridfinity cutout or Keychain image
- **THEN** `set_parameters` and `reset_parameters` are not offered, and reading and export remain

### Requirement: Validated, atomic parameter changes
`set_parameters` SHALL accept a partial patch of the writable fields of the active mode, check it against the mode's schema, normalise it with the mode's own rules and apply it as one change that causes one rebuild. A patch that breaks the schema (unknown field, wrong type, out of range, too large) SHALL be rejected with the JSON path of each problem and SHALL change nothing. The result SHALL report the values the normalisation changed and the mode's validation errors and warnings, with texts.

#### Scenario: Valid patch
- **WHEN** an agent sets the baseplate width to 4 units and the corner fasteners to magnets
- **THEN** both are applied together, one rebuild runs, and the result lists no errors

#### Scenario: Unknown field
- **WHEN** a patch contains a field outside the schema
- **THEN** the call fails with the path of that field and the state is unchanged

#### Scenario: Parameters invalid for the mode
- **WHEN** a patch makes the rack case wider than the rack window
- **THEN** the change is applied as if made in the panel, the panel shows the same error, the result lists the error key and text, and the last valid model is kept

#### Scenario: Value clamped
- **WHEN** a value is outside what the mode normalises to
- **THEN** the result names the field, the value sent and the value used

### Requirement: Model summary
`get_model_info` SHALL wait for the current build to finish, up to a limit, and return for each part its label, bounding box, volume and triangle count, the totals, the validation errors and warnings, and the plate arrangement for the chosen printer including parts that do not fit. It SHALL NOT return mesh data.

#### Scenario: After a change
- **WHEN** an agent changes a parameter and calls `get_model_info`
- **THEN** the answer describes the model built from the new parameters

#### Scenario: Build still running
- **WHEN** the build does not finish within the limit
- **THEN** the answer says it is not ready and the agent can ask again

#### Scenario: Part larger than the bed
- **WHEN** a part does not fit the printer's usable bed
- **THEN** it is listed as overflowing with the sizes

### Requirement: Exports and resets need the user
`request_export` and `reset_parameters` SHALL show a confirmation in the page and SHALL act only when the user confirms. No tool SHALL save a file, download a model, start an AI model or delete stored data by itself. A request that is not answered within two minutes SHALL end as timed out without acting.

#### Scenario: Export confirmed
- **WHEN** an agent calls `request_export` and the user presses Download in the dialog
- **THEN** the files are saved by the normal export path and the call returns `saved`

#### Scenario: Export declined
- **WHEN** the user dismisses the dialog
- **THEN** nothing is saved and the call returns `declined`

#### Scenario: Nothing to export
- **WHEN** the model has errors or no parts
- **THEN** no dialog opens and the call returns the reason

### Requirement: Agent actions are visible and reversible
Every tool call SHALL be written to the activity log with the tool and a short summary of what changed, and the status bar SHALL show that an agent call is running. The user SHALL be able to undo each of the last ten agent changes to the parameters of a mode.

#### Scenario: Logged
- **WHEN** an agent changes a parameter
- **THEN** the log has an entry marked as from an agent that names the tool and the changed fields

#### Scenario: Undo
- **WHEN** the user presses "Undo agent change" after an agent set the width
- **THEN** the mode's parameters return to the values before that call

#### Scenario: State changed since
- **WHEN** the user edited the parameters after the agent's change and presses Undo
- **THEN** the app says the parameters have changed since and asks before restoring

### Requirement: Switch for agents
The app SHALL have a persisted switch "Allow browser agents", on by default, that removes all tools when turned off and registers them again when turned on.

#### Scenario: Turn off
- **WHEN** the user turns the switch off
- **THEN** all tools are unregistered and a later reload keeps them off

### Requirement: Safe tool data
Tool descriptions SHALL be static. Tool inputs SHALL be size-limited and rate-limited. Tools SHALL NOT be exposed to other origins. Results that include text entered by the user SHALL be marked as untrusted content. Tool input SHALL NOT be executed, inserted as markup or used as a file path.

#### Scenario: Oversized patch
- **WHEN** a patch is larger than the limit
- **THEN** it is rejected and nothing changes

#### Scenario: Too many calls
- **WHEN** an agent calls tools faster than the rate limit
- **THEN** the excess calls answer that they are rate limited and change nothing

#### Scenario: File name
- **WHEN** an agent sets the export file name to a string with path separators or markup
- **THEN** it is normalised by the existing file-name rules before use
