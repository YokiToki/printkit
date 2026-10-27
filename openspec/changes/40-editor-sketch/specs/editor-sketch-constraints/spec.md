# Spec Delta

## Purpose
Defines constraints, dimensions, inference, the solver and the reporting of degrees of freedom and conflicts.

## ADDED Requirements

### Requirement: Constraints
The sketch SHALL support the constraints coincident, point on line, point on circle or arc, horizontal, vertical, parallel, perpendicular, tangent, equal, symmetric, midpoint and fixed, added from a menu for the current selection, listed in the properties and removable one by one.

#### Scenario: Add parallel
- **WHEN** two lines are selected and the user applies Parallel
- **THEN** the second line turns to be parallel to the first, a glyph is shown, and the constraint is listed

#### Scenario: Not applicable
- **WHEN** the selection does not fit a constraint
- **THEN** that menu item is disabled with a reason

### Requirement: Dimensions
The sketch SHALL support driving dimensions: length or distance (point–point, point–line, horizontal and vertical), radius or diameter, and angle between two lines. A dimension SHALL be editable in place; lengths are entered with the length field in the shown unit and stored in millimetres.

#### Scenario: Dimension a line
- **WHEN** the user picks Dimension, clicks a line and types 42
- **THEN** the line becomes 42 mm long, the dimension label shows 42, and moving a connected point keeps 42

#### Scenario: Inches
- **WHEN** the unit is inches and the user types 1.5 into a dimension
- **THEN** the stored value is 38.1 mm

#### Scenario: Change later
- **WHEN** the user edits the dimension to 50
- **THEN** the geometry is solved again and dependent features are recomputed

### Requirement: Inference while drawing
While drawing, the Editor SHALL snap to existing points, midpoints, curves, horizontal and vertical alignment, tangent directions and the grid, show which rule matched, and add the matching constraint on click. Ctrl SHALL disable inference.

#### Scenario: Horizontal line
- **WHEN** the user draws a line within 3° of horizontal
- **THEN** it snaps horizontal, a horizontal glyph is shown, and a horizontal constraint is added

#### Scenario: Connected
- **WHEN** a line ends on an existing endpoint
- **THEN** the endpoints are the same point

### Requirement: Solver
The sketch SHALL be solved after every change with all constraints; the solution SHALL be the one nearest to the previous positions, and dragging SHALL update live. If no solution exists the previous positions SHALL be kept and the reason shown.

#### Scenario: Nearest solution
- **WHEN** a dimension is changed on a constrained triangle
- **THEN** the triangle keeps its orientation and does not flip to the mirror image

#### Scenario: No solution
- **WHEN** a dimension makes the sketch impossible (a side longer than the sum of the others)
- **THEN** the geometry stays unchanged, the dimension is marked in red and a message explains

### Requirement: Degrees of freedom and conflicts
The sketch SHALL show the number of degrees of freedom in the status bar, colour under-defined entities blue and fully defined entities black, and mark conflicting or redundant constraints in red naming them.

#### Scenario: Under-defined
- **WHEN** a rectangle has only a width dimension
- **THEN** the status shows the remaining degrees of freedom and the unconstrained corner points are blue

#### Scenario: Fully defined
- **WHEN** all freedoms are removed
- **THEN** the status shows "Fully defined" and all geometry is black

#### Scenario: Redundant
- **WHEN** the user adds a dimension that repeats what constraints already fix
- **THEN** it is marked redundant and the sketch is still usable

#### Scenario: Conflict
- **WHEN** two constraints contradict each other
- **THEN** the conflicting constraints are highlighted red and a message names them; the geometry is not changed
