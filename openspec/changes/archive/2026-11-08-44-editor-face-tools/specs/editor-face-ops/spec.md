# Spec Delta

## Purpose
Defines Push/Pull, sketch on a face and projection of edges.

## ADDED Requirements

### Requirement: Push / Pull
The Editor SHALL move selected planar faces along their normal by a dragged or typed distance, adding material for positive and removing it for negative distances, following the outline of the face including holes.

#### Scenario: Pull out
- **WHEN** the top of a 20 mm cube is pulled 10 mm
- **THEN** the cube becomes 30 mm tall with volume 12000 mm³

#### Scenario: Face with a hole
- **WHEN** a plate face with a hole is pulled
- **THEN** the pulled material has the same hole

#### Scenario: Push in
- **WHEN** the top of a 20 mm cube is pushed −5 mm
- **THEN** the cube becomes 15 mm tall

#### Scenario: Too deep
- **WHEN** the push distance exceeds the material behind the face
- **THEN** it is limited and the message gives the maximum

#### Scenario: Curved face
- **WHEN** the selected face is not planar
- **THEN** the operation is refused with the reason

#### Scenario: Editable
- **WHEN** the operation is later edited in the stack
- **THEN** the distance changes without re-picking the face

### Requirement: Sketch on face
The Editor SHALL start a sketch on a selected planar face, with the origin at the picked point and the x direction along the longest straight boundary edge.

#### Scenario: Start
- **WHEN** the user selects a top face and chooses Sketch on face
- **THEN** sketch mode opens looking at that face and shapes drawn there extrude from the face

#### Scenario: Cut a pocket
- **WHEN** the user draws a circle on the face and extrudes it with the operation Cut
- **THEN** a pocket is made into the body

#### Scenario: Detached
- **WHEN** the face of a face-based sketch can no longer be found
- **THEN** the sketch keeps its last position, is marked detached, and the user can pick a face again

### Requirement: Project edges
The Editor SHALL project the outline and selected edges of a face into the open sketch as lines, arcs and circles.

#### Scenario: Project the outline
- **WHEN** the user projects the outline of a rectangular face with a round hole
- **THEN** four lines and a circle are added, with coincident endpoints

#### Scenario: Construction
- **WHEN** the construction option is on
- **THEN** the projected curves are construction geometry

#### Scenario: No live link
- **WHEN** the face changes afterwards
- **THEN** projected curves do not change until the user refreshes them
