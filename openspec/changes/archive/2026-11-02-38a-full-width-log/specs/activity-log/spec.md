# Spec Delta

## MODIFIED Requirements

### Requirement: Log panel
The log panel SHALL span the full width of the viewport area above the status bar on desktop without overlapping the side parameter panel or the status bar, SHALL list every entry with its time, level, source and message, SHALL let the user filter by level and by source, SHALL keep the newest line in view until the user scrolls up and then offer to jump to the latest, SHALL show technical details of a line on request, and SHALL offer Copy (plain text starting with the app version, the language and the browser) and Clear. It SHALL close with a button and with Esc and return the focus to where it was opened. Other parts of the app, such as the model manager, SHALL be able to open it, also filtered to one source, from any page.

#### Scenario: Full-width bottom panel on desktop
- **WHEN** the log panel is open on a screen 768 px wide or wider
- **THEN** the panel spans the full width of the viewport area from the right edge of the side parameter panel to the right edge of the window, directly above the status bar, with a flat horizontal top border

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
