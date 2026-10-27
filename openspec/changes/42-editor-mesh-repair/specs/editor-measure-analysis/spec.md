# Spec Delta

## Purpose
Defines measuring and the analysis views.

## ADDED Requirements

### Requirement: Measure tool
The Editor SHALL measure the distance between two picked points, the angle between three points, the diameter of a circle fitted to three or more points, and the wall thickness at a point, snapping to vertices, edge midpoints and face centres, and showing results in the selected unit with a copy action.

#### Scenario: Distance
- **WHEN** the user picks two opposite corners of a 40 × 30 × 20 mm block
- **THEN** the distance is shown as 53.85 mm

#### Scenario: Hole diameter
- **WHEN** the user picks three points on the edge of a 6 mm hole
- **THEN** the diameter is shown as 6.0 mm with the fit residual

#### Scenario: Thickness
- **WHEN** the user picks a point on the outer face of a 2 mm wall
- **THEN** the thickness is shown as 2.0 mm

#### Scenario: Inches
- **WHEN** the unit is inches
- **THEN** the values are shown in inches and the stored millimetre values are unchanged

### Requirement: Overhang map
The Editor SHALL colour surfaces that overhang more than a chosen angle for the current orientation, updating after a transform is committed.

#### Scenario: Tilted cube
- **WHEN** a cube is tilted and the map is on at 45°
- **THEN** the downward faces beyond 45° are coloured and the others are not

### Requirement: Thin-wall map
The Editor SHALL colour regions whose wall thickness is below a threshold that defaults to twice the nozzle diameter from the export settings.

#### Scenario: Thin rib
- **WHEN** a model has a 0.5 mm rib and the nozzle is 0.4 mm
- **THEN** the rib is coloured as too thin

### Requirement: Section view
The Editor SHALL clip the view with a plane along X, Y or Z controlled by a slider, without changing the model or exports.

#### Scenario: Section
- **WHEN** the user moves the Z section slider to the middle of a hollow part
- **THEN** the cavity is visible and exporting still produces the whole part

### Requirement: Analysis is view-only
Measurements and overlays SHALL NOT be saved in the document or create history steps.

#### Scenario: Reload
- **WHEN** the page is reloaded
- **THEN** no measurements or overlays remain
