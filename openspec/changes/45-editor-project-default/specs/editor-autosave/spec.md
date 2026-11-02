# Spec Delta

## Purpose
Defines autosave, recovery, multi-tab protection and recent projects.

## ADDED Requirements

### Requirement: Autosave
The Editor SHALL save snapshots of the working document to browser storage shortly after changes, keeping the three newest per project.

#### Scenario: Idle after change
- **WHEN** the user stops editing for two seconds
- **THEN** a snapshot is written without blocking the interface

#### Scenario: Constant editing
- **WHEN** the user edits continuously for two minutes
- **THEN** snapshots are written at least every 30 seconds

#### Scenario: Storage unavailable
- **WHEN** browser storage cannot be used
- **THEN** a warning is shown once and editing continues

### Requirement: Recovery
After an unexpected close the Editor SHALL offer to restore the newest snapshot that is newer than the last saved file.

#### Scenario: Crash
- **WHEN** the tab is closed with unsaved work and the editor is opened again
- **THEN** a banner offers Restore or Discard, and Restore brings back the document

#### Scenario: Nothing newer
- **WHEN** the last snapshot is older than the last save
- **THEN** no banner is shown

### Requirement: Second tab
The Editor SHALL detect another tab editing the same project and warn before the second one changes it.

#### Scenario: Two tabs
- **WHEN** the same project is open in two tabs
- **THEN** the later tab shows a notice with a Take over action and editing there is blocked until chosen

### Requirement: Recent projects
The Editor SHALL list recent projects with name, date and thumbnail and reopen them in one click where possible.

#### Scenario: Reopen
- **WHEN** the user clicks a recent project that has a stored file handle
- **THEN** it opens, asking for file permission if required

#### Scenario: No handle
- **WHEN** a recent project has no handle
- **THEN** the latest autosave of it opens, or the Open dialog is offered if none exists

### Requirement: Local data control
The Editor SHALL show what it stores locally (snapshots, recent list, meshes) with sizes and allow clearing it.

#### Scenario: Clear
- **WHEN** the user clears local data
- **THEN** snapshots, recent entries and unreferenced meshes are removed after a confirmation, and the saved files on disk are untouched
