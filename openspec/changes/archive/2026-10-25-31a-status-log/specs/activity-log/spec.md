# Spec Delta

## Purpose
Defines the shared activity log of the app, the line that shows it in the status bar and the panel that shows all of it.

## ADDED Requirements

### Requirement: Shared activity log
The app SHALL keep one activity log for all its parts. Each entry SHALL have a time, a level (information, warning, error), a source and a message in the language of the interface, and MAY have technical details. Long work SHALL be a job with a state (running, done, failed, cancelled), an optional progress and an optional Cancel; progress updates SHALL change the job's line instead of adding lines. The log SHALL keep at most 500 entries, dropping the oldest first and never a running job, SHALL live in the memory of the page only, and SHALL NOT contain image data or file contents nor be sent anywhere.

#### Scenario: Language follows the interface
- **WHEN** the interface language is changed
- **THEN** all lines, old and new, are shown in the new language

#### Scenario: Progress in place
- **WHEN** a job reports its progress many times
- **THEN** its current line changes and the log does not gain a line for each report

#### Scenario: Bounded
- **WHEN** more than 500 entries have been logged
- **THEN** the oldest finished entries are dropped and a running job stays

#### Scenario: Not kept
- **WHEN** the page is reloaded
- **THEN** the log starts empty

### Requirement: Status bar
The status bar under the 3D view SHALL keep showing the model's size, and SHALL show on its right a loader and the current line of the running job, with a Cancel when the job has one. When nothing runs it SHALL show the latest message for a few seconds and then that the model is ready. It SHALL show the number of warnings and errors, and the whole right part SHALL be one control that opens the log panel by click or by keyboard. A running job longer than a fraction of a second SHALL be what shows the loader, in place of any separate generating flag of a mode.

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

### Requirement: Log panel
The log panel SHALL list every entry with its time, level, source and message, SHALL let the user filter by level and by source, SHALL keep the newest line in view until the user scrolls up and then offer to jump to the latest, SHALL show technical details of a line on request, and SHALL offer Copy (plain text starting with the app version, the language and the browser) and Clear. It SHALL close with a button and with Esc and return the focus to where it was opened. Other parts of the app, such as the model manager, SHALL be able to open it, also filtered to one source, from any page.

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
- **WHEN** another part of the app opens the log for one source
- **THEN** the panel opens with that source selected, on any page, also where there is no status bar

#### Scenario: Phone
- **WHEN** the screen is narrower than 768 px
- **THEN** the panel is a sheet from the bottom with the same content

### Requirement: What the app reports
The app SHALL report to the log: each model generation (start, how long it took, the number of triangles, validation messages and warnings, failures with details), the import of images, meshes and fonts (name, size, whether the image was downscaled, failures), the fall-back to memory when the browser's storage is unavailable, the steps of the photo dialog (sheet found or not, paper, silhouettes found with their sizes, cutouts created) and the export (format, printer, plates, parts that do not fit, files built). Moving a control SHALL NOT add a line for each movement; only the rebuild it triggers SHALL, and rebuilds that follow each other within the delay of the model update SHALL be one job.

#### Scenario: Generation
- **WHEN** a parameter changes and the model is rebuilt
- **THEN** one job reports the start and the result with its duration

#### Scenario: Slider
- **WHEN** the user drags a slider
- **THEN** the log gains lines only for the rebuilds that actually run, not for every movement

#### Scenario: Failure
- **WHEN** a generation fails or a parameter is invalid
- **THEN** an error or a warning line says why, with details on request, and the model that was shown stays

#### Scenario: Storage
- **WHEN** persistent storage is unavailable
- **THEN** a warning says that results will not be kept, once per session

### Requirement: Accessibility
The status line SHALL be announced politely to assistive technology at most about once a second, the control that opens the log SHALL have an accessible name, and the panel SHALL be reachable and closable with the keyboard.

#### Scenario: Announcements
- **WHEN** a job reports progress many times a second
- **THEN** a screen reader announces at most about one line a second

#### Scenario: Keyboard
- **WHEN** the user uses only the keyboard
- **THEN** they can open the log from the status bar, move through its controls and close it with Esc

### Requirement: Language
All text of the status line, the panel and the messages the app logs SHALL be available in every language of the app.

#### Scenario: Russian
- **WHEN** the interface language is Russian
- **THEN** the status line, the panel, its controls and the logged messages are in Russian
