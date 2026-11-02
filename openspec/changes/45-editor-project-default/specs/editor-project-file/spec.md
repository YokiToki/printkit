# Spec Delta

## Purpose
Defines the `.pkit` project file: saving, opening, versioning and safety.

## ADDED Requirements

### Requirement: Save a project
The Editor SHALL save the whole document (objects, stacks, sketches, cuts and the meshes they use) to a single `.pkit` file, writing in place where the browser allows and downloading otherwise.

#### Scenario: First save
- **WHEN** the user presses Ctrl+S on a new project
- **THEN** a name is requested (defaulting to the project name), a `.pkit` file is written or downloaded, and the unsaved marker disappears

#### Scenario: In place
- **WHEN** the browser supports file access and the project was saved before
- **THEN** Ctrl+S overwrites the same file without a dialog

#### Scenario: Save As
- **WHEN** the user chooses Save As
- **THEN** a new file is written and later saves go to it

#### Scenario: Large project
- **WHEN** the project contains hundreds of megabytes of meshes
- **THEN** saving shows progress and the page stays responsive

### Requirement: Open a project
The Editor SHALL open a `.pkit` file from a dialog or by dropping it on the page, replacing the current document after offering to save unsaved changes.

#### Scenario: Round trip
- **WHEN** a project with imported meshes, sketches, a cut and a stack is saved and opened in a fresh browser profile
- **THEN** the scene, parameters and resulting geometry are identical, with bounding boxes and volumes equal

#### Scenario: Unsaved changes
- **WHEN** the user opens a file while there are unsaved changes
- **THEN** a dialog offers Save, Discard or Cancel

#### Scenario: History
- **WHEN** a project is opened
- **THEN** the undo history starts empty and the camera frames the scene

### Requirement: Format versions
The file SHALL carry a format version; older files SHALL be migrated, newer files SHALL open with a warning and keep unknown data when saved again.

#### Scenario: Older file
- **WHEN** a file of an earlier format version is opened
- **THEN** it opens normally and is saved in the current format

#### Scenario: Newer file
- **WHEN** a file made by a newer version is opened
- **THEN** a warning says some data may be dropped, and unknown fields are written back unchanged on save

### Requirement: Safe reading
Opening SHALL refuse archives that break limits or contain unexpected paths, verify the hash of each mesh, and never execute content.

#### Scenario: Bad path
- **WHEN** the archive contains an entry with `..` in its path
- **THEN** the file is refused with a message and nothing changes

#### Scenario: Corrupted mesh
- **WHEN** a mesh entry does not match its hash
- **THEN** the objects using it are marked "mesh corrupted", the rest loads, and the log names the entry

#### Scenario: Too big
- **WHEN** the uncompressed size exceeds the limit
- **THEN** the file is refused with the limit stated

### Requirement: Unsaved state
The Editor SHALL show an unsaved marker next to the project name, prompt before leaving the page with unsaved changes, and clear the marker when undo returns to the saved state.

#### Scenario: Leave
- **WHEN** the user closes the tab with unsaved changes
- **THEN** the browser asks for confirmation

#### Scenario: Undo to saved
- **WHEN** the user makes a change and undoes it
- **THEN** the unsaved marker disappears
