# Spec Delta

## Purpose
Defines selection and the ways to move, rotate, scale and place objects.

## ADDED Requirements

### Requirement: Selection
The Editor SHALL select objects by click, by Shift/Ctrl click (toggle), by box drag, from the outliner and by Select all, and clear the selection on Esc or a click on empty space. Selected objects SHALL be outlined in the view.

#### Scenario: Click
- **WHEN** the user clicks an object
- **THEN** only that object is selected and its outline is drawn

#### Scenario: Add
- **WHEN** the user Shift-clicks a second object
- **THEN** both are selected; Shift-clicking a selected object removes it

#### Scenario: Box select
- **WHEN** the user drags a rectangle on empty space
- **THEN** every unlocked visible object whose bounds intersect it is selected and the camera does not orbit

### Requirement: Gizmo
The Editor SHALL show a move, rotate or scale gizmo at the selection, switch tools by tool bar and hotkeys, and commit one history step per drag.

#### Scenario: Move
- **WHEN** the user drags the X arrow
- **THEN** the object moves along X only, the geometry is not rebuilt, and on release one undo step "Move" is recorded

#### Scenario: Several objects
- **WHEN** three objects are selected and the user rotates
- **THEN** they rotate together about the centre of the selection bounds

#### Scenario: Orbit not disturbed
- **WHEN** the user drags a gizmo handle
- **THEN** the camera does not orbit

### Requirement: Numeric transform
The properties SHALL edit position, rotation (degrees) and size (length fields) of the selection, with a proportion lock for size, and SHALL apply on commit with one history step.

#### Scenario: Exact size
- **WHEN** the user types 25 into the X size of a 50 mm wide box with the proportion lock on
- **THEN** all three dimensions halve and the position of the object's centre in X and Y is kept

#### Scenario: Several selected
- **WHEN** objects are selected together and a position value is typed
- **THEN** the selection's bounding box centre moves to that value

### Requirement: Snapping
The Editor SHALL snap moves to a grid step and rotations to an angle step when snapping is on, and SHALL let the user hold Alt to invert it while dragging.

#### Scenario: Grid
- **WHEN** snapping is on with step 5 mm and the user drags an object
- **THEN** its position changes in 5 mm steps

#### Scenario: Angle
- **WHEN** snapping is on with 15° and the user rotates
- **THEN** the angle changes in 15° steps

### Requirement: Placement commands
The Editor SHALL provide Drop to bed, Center on bed, Reset transform, Mirror along X / Y / Z and Scale to size, each as one history step.

#### Scenario: Drop to bed
- **WHEN** an object floats above the bed and the user presses `D`
- **THEN** its lowest vertex is at z = 0 and X and Y are unchanged

#### Scenario: Mirror
- **WHEN** the user mirrors an object along X
- **THEN** its bounds are unchanged and triangle winding is corrected so it exports with outward normals

#### Scenario: Below the bed
- **WHEN** an object is moved below z = 0
- **THEN** it stays there, its measurement shows the negative minimum, and exporting warns that the part is below the bed
