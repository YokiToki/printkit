# Spec Delta

## Purpose
Defines profiles, Extrude, Revolve, edge chamfer and fillet of extrusions, the feature list of a body and recomputation.

## ADDED Requirements

### Requirement: Profiles
The Editor SHALL find closed profiles in the visible, non-construction geometry of a sketch, treat loops inside loops as holes, and report open ends and crossing curves with their position.

#### Scenario: Plate with a hole
- **WHEN** a sketch has a rectangle with a circle inside
- **THEN** one profile with one hole is found

#### Scenario: Open profile
- **WHEN** two lines of a rectangle do not meet
- **THEN** extruding is refused, the message says "profile is not closed" and the gap is marked in the view

#### Scenario: Crossing curves
- **WHEN** two loops overlap without being nested
- **THEN** the message names the crossing point and nothing is extruded

### Requirement: Extrude
The Editor SHALL extrude selected profiles of a sketch by a distance on one side, symmetrically, or by two distances, with the operation New body, Join, Cut or Intersect, showing a live preview while the dialog is open.

#### Scenario: New body
- **WHEN** the user extrudes a 40 × 20 rectangle by 10 mm
- **THEN** a body of 40 × 20 × 10 mm with volume 8000 mm³ is created on the sketch plane, and the sketch is hidden

#### Scenario: Symmetric
- **WHEN** the side is symmetric with distance 10
- **THEN** the body extends 5 mm to each side of the plane

#### Scenario: Cut
- **WHEN** the user extrudes a circle with the operation Cut through a body
- **THEN** a hole is made in that body and no new body is created

#### Scenario: Pick regions
- **WHEN** a sketch has two separate profiles and the user clicks only one in the view
- **THEN** only that profile is extruded

#### Scenario: Zero distance
- **WHEN** the distance is zero or negative
- **THEN** the field shows the limit and the preview is not updated

### Requirement: Revolve
The Editor SHALL revolve a profile around a sketch line or a plane axis by an angle from 1° to 360°.

#### Scenario: Full revolution
- **WHEN** a rectangle beside the axis is revolved 360°
- **THEN** the result is a ring or cylinder whose volume equals the Pappus value within the polygon approximation

#### Scenario: Crossing the axis
- **WHEN** the profile crosses the axis
- **THEN** the revolve is refused with a message

### Requirement: Edge chamfer and fillet of extrusions
An Extrude SHALL allow a chamfer or a fillet of the top and bottom edges with a size, built from the profile so that holes and rounded corners follow it.

#### Scenario: Chamfer
- **WHEN** the top chamfer is 1 mm on a 40 × 20 × 10 extrusion
- **THEN** the top face is 38 × 18 mm and the wall ring is a 45° slope

#### Scenario: Too large
- **WHEN** the size is larger than half the thinnest part of the profile
- **THEN** the edge break is skipped and a warning says the maximum size

### Requirement: Feature list and recompute
A body built from sketches SHALL keep an ordered list of features (the first is New body), shown under the body in the outliner, each editable and deletable. Changing any dimension of a used sketch or any feature parameter SHALL recompute the body.

#### Scenario: Edit dimension
- **WHEN** the user edits the width of the sketch used by a plate and its hole features
- **THEN** the plate and the holes follow, and the position of the hole relative to the sketch constraints is kept

#### Scenario: Failed feature
- **WHEN** a feature fails (its sketch lost its closed profile)
- **THEN** the body shows the result before that feature, the feature is marked failed in the list with the reason, and later features are skipped

#### Scenario: Delete a feature
- **WHEN** the user deletes the middle feature
- **THEN** the body is recomputed without it

#### Scenario: Reload
- **WHEN** the page is reloaded
- **THEN** the sketches, features and bodies are restored and rebuilt identically

### Requirement: Derived mesh
The mesh of a sketch-built body SHALL be derived from its sketches and features and SHALL NOT be the only stored copy.

#### Scenario: Missing mesh
- **WHEN** the mesh cache is cleared
- **THEN** the body is rebuilt from the stored description without data loss
