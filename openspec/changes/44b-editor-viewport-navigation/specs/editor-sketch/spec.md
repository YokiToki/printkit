# Spec Delta

## Purpose
Specifies sketch grid appearance with 5×5 hierarchy, smooth cursor-anchored zoom, and Shift-drag camera panning.

## MODIFIED Requirements

### Requirement: Sketch planes and mode
The Editor SHALL create a sketch on the XY, XZ or YZ plane with an offset along the normal, enter a sketch mode that looks at the plane orthogonally with an adaptive 5×5 grid with major line emphasis every 5 divisions, support cursor-anchored smooth zooming matching the 3D viewport, allow camera panning via Shift+drag without creating selection boxes, and leave it with Finish sketch.

#### Scenario: New sketch
- **WHEN** the user chooses Add → Sketch → XZ plane
- **THEN** a sketch "Sketch 1" is created, the camera looks along the plane normal, the grid is 2D, and the sketch tools replace the scene tools

#### Scenario: Camera lock
- **WHEN** the user drags with the left button on empty space in sketch mode
- **THEN** the camera does not rotate; wheel and middle-drag still zoom and pan

#### Scenario: Finish
- **WHEN** the user presses Enter or Finish
- **THEN** the scene mode returns, the sketch stays visible as curves, and one history step "Edit sketch" is kept

#### Scenario: Adaptive sketch grid
- **WHEN** in sketch mode
- **THEN** the grid displays major lines every 5 minor divisions and adaptively reveals 5×5 subdivisions as the user zooms in

#### Scenario: Shift drag pans camera
- **WHEN** the user holds Shift and drags with the left mouse button
- **THEN** the camera pans across the sketch plane, and no box-selection rectangle or curve drag is initiated

#### Scenario: Smooth zoom in sketch
- **WHEN** the user scrolls the mouse wheel or pinches a trackpad in sketch mode
- **THEN** the zoom operates smoothly and continuously around the cursor position without discrete 15% jumps
