# Spec Delta

## MODIFIED Requirements

### Requirement: Status bar
The status bar under the 3D view SHALL keep showing the model's size, and SHALL show on its right a loader and the current line of the running job, with a Cancel when the job has one. When nothing runs it SHALL show the latest message for a few seconds and then that the model is ready. It SHALL show the number of warnings and errors, and the whole right part SHALL be one control that opens the log panel by click or by keyboard. The control SHALL have a neat appearance with its outline visible only on hover. A running job longer than a fraction of a second SHALL be what shows the loader, in place of any separate generating flag of a mode.

#### Scenario: Current line
- **WHEN** a model is being generated or a photo is being processed
- **THEN** the status bar shows a loader and what is happening now

#### Scenario: Ready
- **WHEN** no job is running and a model exists
- **THEN** the status bar shows that the model is ready

#### Scenario: Counters
- **WHEN** a warning or an error has been logged
- **THEN** the status bar shows how many there are

#### Scenario: Open
- **WHEN** the user clicks the right part of the status bar or presses Enter on it
- **THEN** the log panel opens

#### Scenario: Cancel
- **WHEN** the running job has a Cancel and the user presses it
- **THEN** the job stops and its line says that it was cancelled

#### Scenario: Narrow screen
- **WHEN** the screen is 390 px wide
- **THEN** the size shortens, the line is truncated with an ellipsis, and the counters and the loader stay visible

#### Scenario: Outline on hover only
- **WHEN** the user views the status bar control
- **THEN** its outline is transparent by default and becomes visible when hovered

### Requirement: Log panel
The log panel SHALL be rendered only within editor modes above the status bar without overlapping the status bar, SHALL span the full width of the editor viewport area (expanding across the entire editor width when the parameter panel is collapsed), SHALL adopt a compact DevTools-style layout with four dedicated tabs — Journal (`log`), Agents (`agent`), Models (`models`), and Resources (`resources`) — without mixing unrelated controls between tabs, SHALL list entries and provide level/source filtering within the Journal tab, SHALL isolate agent enable and undo controls to the Agents tab, SHALL isolate AI model specs, download, and storage actions to the Models tab, and SHALL isolate system metrics to the Resources tab where CPU text stays strictly contained within its group box. It SHALL close with a button and with Esc and return the focus to where it was opened. Other parts of the app, such as model settings or AI status links, SHALL be able to open it with the corresponding tab or source selected.

#### Scenario: Full-width bottom panel on desktop
- **WHEN** the log panel is open on a screen 768 px wide or wider
- **THEN** the panel spans the full width of the viewport area directly above the status bar without overlapping it, expanding across the whole window when the parameter panel is collapsed

#### Scenario: Filters
- **WHEN** the user chooses to show only errors, or only one source
- **THEN** only matching lines are shown, with the number of lines per source

#### Scenario: Follow the newest
- **WHEN** new lines arrive and the user is at the end of the list
- **THEN** the list follows them, and when the user has scrolled up it stays and a control jumps to the latest

#### Scenario: Copy
- **WHEN** the user presses Copy
- **THEN** the text of the shown lines, with the app version, the language and the browser, is put on the clipboard and the panel says so

#### Scenario: Clear
- **WHEN** the user presses Clear
- **THEN** all finished entries are removed and the counters reset

#### Scenario: Opened from elsewhere
- **WHEN** another part of the app opens the log for one source or requests model management
- **THEN** the panel opens with that source or tab selected

#### Scenario: Phone
- **WHEN** the screen is narrower than 768 px
- **THEN** the panel is a sheet positioned above the status bar with the same content

#### Scenario: Only in editor modes
- **WHEN** the user is on the root start page or a product mode chooser
- **THEN** the log panel is not rendered

#### Scenario: Four separate tabs without mixing
- **WHEN** the user switches between tabs in the panel
- **THEN** the tab bar displays Journal, Agents, Models, and Resources tabs, and each tab displays strictly its own controls and content without showing other tabs' actions in the header

#### Scenario: Contained CPU text in Resources
- **WHEN** the Resources tab displays CPU pressure metrics with long values
- **THEN** the text wraps or flexes within the card boundaries and does not extend outside the CPU group box
