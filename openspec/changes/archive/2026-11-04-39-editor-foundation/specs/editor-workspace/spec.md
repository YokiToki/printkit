# Spec Delta

## Purpose
Defines the Editor product: its place in the site, its shell, view controls and persistence of the document.

## ADDED Requirements

### Requirement: Editor product
The site SHALL have an Editor product at `/editor`, listed first among the products and shown as the main card on the start page. The generator products SHALL keep their routes, storage keys and behaviour.

#### Scenario: Start page
- **WHEN** the user opens `/`
- **THEN** the Editor card is shown first and larger than the generator cards, and choosing it opens `/editor`

#### Scenario: Generators unchanged
- **WHEN** the user opens `/gridfinity/baseplate`, `/keychain/shape` or `/rack/case`
- **THEN** they behave exactly as before this change, with their stored settings intact

#### Scenario: Header
- **WHEN** the user is in the Editor
- **THEN** the logo text shows the Editor and the product switcher lists all four products

### Requirement: Editor shell
The Editor SHALL show an outliner, a 3D view, a properties panel and a tool bar. The 3D view SHALL be the existing viewport with the existing status bar and measurements. Below 768 px the outliner and properties SHALL be drawers.

#### Scenario: Desktop
- **WHEN** the window is at least 768 px wide
- **THEN** outliner, view and properties are visible side by side and each side panel can be collapsed

#### Scenario: Narrow window
- **WHEN** the window is narrower than 768 px
- **THEN** the view fills the screen and the outliner and properties open as bottom drawers from the tool bar

### Requirement: View controls
The Editor SHALL provide a ViewCube with standard views, a perspective / orthographic switch, Fit all and Fit selection. The camera SHALL keep orbiting below the XY plane.

#### Scenario: Standard view
- **WHEN** the user clicks the Top face of the ViewCube
- **THEN** the camera looks straight down at the same target and distance

#### Scenario: Orthographic
- **WHEN** the user switches to orthographic
- **THEN** the scene is drawn without perspective with the same framing, and switching back restores the perspective view

#### Scenario: Fit selection
- **WHEN** objects are selected and the user presses `F`
- **THEN** the camera frames the selection; with no selection it frames all visible objects

### Requirement: Hotkeys
Editor shortcuts SHALL be defined in one registry, be ignored while an input has focus, and be listed in a popover reachable from the tool bar.

#### Scenario: Typing in a field
- **WHEN** focus is in a number field and the user presses `G` or `Delete`
- **THEN** no editor command runs

### Requirement: Persistence of the document
The Editor SHALL restore the scene after a reload, keeping object descriptions in `localStorage` and meshes in IndexedDB, and SHALL work (without persistence of meshes, with a warning) when IndexedDB is unavailable.

#### Scenario: Reload
- **WHEN** the user reloads the page after importing a file and adding a box
- **THEN** both objects reappear at the same place with the same names and parameters

#### Scenario: Missing mesh
- **WHEN** a stored object refers to a mesh that is no longer in the store
- **THEN** the object is shown in the outliner flagged as missing, an error is written to the log, and the rest of the scene is unaffected

#### Scenario: Corrupt record
- **WHEN** the stored description is not valid
- **THEN** the Editor starts with an empty scene and does not crash

### Requirement: Language and units
All Editor text SHALL be available in English and Russian, and every length field SHALL show the selected unit while the document is stored in millimetres.

#### Scenario: Unit switch
- **WHEN** the user switches to inches
- **THEN** positions and sizes show in inches and the stored values and the exported file do not change
