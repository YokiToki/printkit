# Spec Delta

## Purpose
Defines the editor as the entry point of the site, the generators section and the round trip between generators and the editor.

## ADDED Requirements

### Requirement: Editor at the site root
The site SHALL open the editor at `/`, show a start overlay while the project is empty, and keep the product chooser at `/generators`.

#### Scenario: First visit
- **WHEN** a visitor opens the site
- **THEN** the editor opens with the overlay offering New, Open, Recent, Import STL and the generator cards

#### Scenario: Generators
- **WHEN** the visitor opens `/generators`
- **THEN** the chooser of Gridfinity, Keychain and Rack is shown as before

#### Scenario: Old deep links
- **WHEN** a visitor opens `#/gridfinity/box`, `#/keychain/shape`, `#/rack/case` or `#/baseplate`
- **THEN** the same mode opens as before this change, with its stored settings

#### Scenario: Editor path
- **WHEN** a visitor opens `#/editor`
- **THEN** they are sent to `/`

### Requirement: Start overlay
The start overlay SHALL offer to continue the last project, start a new one, open a file, import STL files, open a recent project and go to a generator, and SHALL disappear as soon as the project has content or the user dismisses it.

#### Scenario: Continue
- **WHEN** a previous project exists
- **THEN** Continue restores it from the latest autosave or recent entry

#### Scenario: Import from overlay
- **WHEN** the user drops an STL on the overlay
- **THEN** it is imported and the overlay closes

### Requirement: Navigation
The header SHALL link the logo to the editor, list the Editor and Generators in the product switcher, and keep the generator mode switchers inside the generators.

#### Scenario: From a generator
- **WHEN** the user clicks the logo inside a generator
- **THEN** the editor opens and the generator's state is kept

### Requirement: Send to Editor
Each generator mode SHALL offer Send to Editor, which adds the model parts to the editor scene as objects that remember their generator, mode and parameters.

#### Scenario: Send a baseplate
- **WHEN** the user sends a 4 × 3 baseplate from the generator
- **THEN** the editor opens with an object of that shape on the bed, named after the mode

#### Scenario: Several parts
- **WHEN** the model has several parts
- **THEN** one object per part is created and grouped

#### Scenario: Unavailable
- **WHEN** the mode needs a file that is no longer stored (for example a Cutout mesh)
- **THEN** the button is disabled with the reason

### Requirement: Edit in generator
An editor object with a generator origin SHALL offer Edit in generator, which opens the generator with the object's parameters and a Back to editor bar, and on return replaces the object's mesh while keeping its transform and stack, without overwriting the user's own saved generator settings.

#### Scenario: Round trip
- **WHEN** the user edits a baseplate in the generator, changes its width and returns
- **THEN** the object has the new width at the same position and rotation, and later opening the generator directly shows the user's earlier saved settings

#### Scenario: Part count changed
- **WHEN** the edit changes the number of parts
- **THEN** extra objects are added or missing ones removed in one history step and the log notes it

#### Scenario: Cancel
- **WHEN** the user leaves through Back to editor without changes
- **THEN** the object is unchanged and no history step is added
