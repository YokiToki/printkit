# Spec Delta

## Purpose
Defines undo and redo of document changes.

## ADDED Requirements

### Requirement: Undo and redo
The Editor SHALL undo and redo every change to the document (import, add, delete, rename, transform, parameter edit, visibility, lock, duplicate, mirror) with `Ctrl+Z` and `Ctrl+Shift+Z` / `Ctrl+Y` and tool bar buttons, keeping up to 100 steps.

#### Scenario: Undo import
- **WHEN** the user imports a file and presses `Ctrl+Z`
- **THEN** the object disappears; `Ctrl+Shift+Z` brings it back with the same mesh and transform

#### Scenario: New change after undo
- **WHEN** the user undoes two steps and then makes a change
- **THEN** the redo steps are discarded

#### Scenario: Step name
- **WHEN** a change is made or undone
- **THEN** the status bar shows its name ("Move", "Import bracket.stl") briefly

### Requirement: Merged edits
Continuous edits of the same field or gizmo drag SHALL form one step.

#### Scenario: Gizmo drag
- **WHEN** the user drags an object for two seconds
- **THEN** one undo returns it to where it started

#### Scenario: Typing
- **WHEN** the user types "25" into a size field (two key presses)
- **THEN** one undo returns the previous value

### Requirement: History and storage
History SHALL be kept in memory only, SHALL not include the selection or the camera, and SHALL keep a deleted object's mesh in the store until the history is cleared or the page is closed.

#### Scenario: Undo delete
- **WHEN** the user deletes an imported object and undoes
- **THEN** the object returns with its mesh, even if the page was not reloaded in between

#### Scenario: After reload
- **WHEN** the page is reloaded
- **THEN** undo is empty and the stored scene is the current one
