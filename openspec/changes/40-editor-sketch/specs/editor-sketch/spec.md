# Spec Delta

## Purpose
Defines sketches on planes, the sketch mode, the drawing and editing tools and how sketches appear in the editor.

## ADDED Requirements

### Requirement: Sketch planes and mode
The Editor SHALL create a sketch on the XY, XZ or YZ plane with an offset along the normal, enter a sketch mode that looks at the plane orthogonally with a 2D grid, and leave it with Finish sketch.

#### Scenario: New sketch
- **WHEN** the user chooses Add → Sketch → XZ plane
- **THEN** a sketch "Sketch 1" is created, the camera looks along the plane normal, the grid is 2D, and the sketch tools replace the scene tools

#### Scenario: Camera lock
- **WHEN** the user drags with the left button on empty space in sketch mode
- **THEN** the camera does not rotate; wheel and middle-drag still zoom and pan

#### Scenario: Finish
- **WHEN** the user presses Enter or Finish
- **THEN** the scene mode returns, the sketch stays visible as curves, and one history step "Edit sketch" is kept

### Requirement: Sketches in the outliner
Sketches SHALL be listed under "Sketches" with rename, show/hide, edit and delete, separately from bodies.

#### Scenario: Delete a used sketch
- **WHEN** the user deletes a sketch used by a feature
- **THEN** a confirmation names the dependent bodies; if confirmed the sketch is removed and those features are marked failed

### Requirement: Drawing tools
The sketch mode SHALL provide Line (polyline), Rectangle (two corners or centre, with an optional corner radius), Circle (centre and radius), Arc (three points, or centre-start-end), Slot and regular Polygon, each accepting typed values for the main dimensions while drawing.

#### Scenario: Rounded rectangle
- **WHEN** the user draws a rectangle with corner radius 5 mm
- **THEN** four lines and four tangent arcs are created, the radii are tied by an equal constraint, and one radius dimension of 5 mm drives all four

#### Scenario: Typed values
- **WHEN** the user starts a circle and types 12 and Enter
- **THEN** the circle has radius 12 mm and a radius dimension

#### Scenario: Slot
- **WHEN** the user draws a slot of length 30 and width 8
- **THEN** two lines and two arcs are created, tangent to each other, with the width as a dimension

### Requirement: Editing tools
The sketch mode SHALL provide Fillet and Chamfer of a corner between two lines, Trim to the nearest intersections, Mirror about a line, Construction toggle and Delete, and dragging of points and curves that respects the constraints.

#### Scenario: Fillet
- **WHEN** the user picks a corner of two lines and enters radius 3
- **THEN** both lines are shortened to the tangent points, a tangent arc of radius 3 is added with a radius dimension

#### Scenario: Chamfer
- **WHEN** the user chamfers a corner with distance 2
- **THEN** a line replaces the corner with the distance as a dimension on each side

#### Scenario: Fillet impossible
- **WHEN** the radius is larger than the adjacent lines allow
- **THEN** nothing changes and the message says the maximum allowed radius

#### Scenario: Drag
- **WHEN** the user drags a corner of a fully constrained rectangle
- **THEN** it does not move; dragging a free corner moves it with all constraints still satisfied

### Requirement: Construction geometry
Curves marked as construction SHALL be drawn dashed, SHALL take part in constraints and snapping, and SHALL NOT form profiles.

#### Scenario: Construction circle
- **WHEN** a circle is toggled to construction
- **THEN** it is dashed and an extrude of the sketch ignores it

### Requirement: Undo in sketch mode
All sketch edits SHALL be undoable with the editor's undo and redo; a drag or a typed value SHALL be one step.

#### Scenario: Undo a dimension
- **WHEN** the user changes a dimension from 40 to 50 and presses Ctrl+Z
- **THEN** the dimension and the geometry return to 40 without a visible solver run
