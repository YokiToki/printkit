# Spec Delta

## Purpose
Defines Fillet and Chamfer of straight and circular edges of any body.

## ADDED Requirements

### Requirement: Chamfer
The Editor SHALL chamfer selected convex or concave edges between two planar faces and circular edges by a distance, with a live preview.

#### Scenario: Box edge
- **WHEN** one top edge of a 20 mm cube is chamfered by 2 mm
- **THEN** the cube loses a triangular prism of cross-section 2 mm² and its volume decreases by 2 × 20 = 40 mm³

#### Scenario: Cylinder rim
- **WHEN** the top rim of a 20 mm diameter cylinder is chamfered by 1 mm
- **THEN** the top face has diameter 18 mm and a 45° ring slopes down

#### Scenario: Concave edge
- **WHEN** an inner corner edge is chamfered
- **THEN** material is added in the corner

### Requirement: Fillet
The Editor SHALL fillet selected convex or concave edges with a radius, built as a smooth arc whose smoothness follows a chord tolerance.

#### Scenario: Box edge
- **WHEN** one top edge of a 20 mm cube is filleted with radius 3 mm
- **THEN** the volume decreases by (1 − π/4) × 9 × 20 ≈ 38.6 mm³ within the arc tolerance

#### Scenario: Hole rim
- **WHEN** the edge of a through hole is filleted
- **THEN** the hole mouth is rounded all around

#### Scenario: Several edges
- **WHEN** the four top edges of a cube are filleted together
- **THEN** the corners are blended and the result is a valid closed solid

### Requirement: Limits and messages
The operations SHALL refuse edges they cannot treat, with the reason: free-form or curved-surface edges, dihedral angles outside the supported range, and sizes larger than the adjacent faces allow, giving the maximum size.

#### Scenario: Too large
- **WHEN** the radius is larger than half the shorter adjacent face
- **THEN** the operation fails with the maximum allowed radius

#### Scenario: Free-form edge
- **WHEN** a selected chain is free-form
- **THEN** it is refused with "not a line or circle"

### Requirement: Editable operations
Fillet and Chamfer SHALL be stack operations that keep their edge references and size and can be edited, suppressed or reordered.

#### Scenario: Change the radius
- **WHEN** the user changes the radius of an existing fillet
- **THEN** the body updates without re-picking edges

#### Scenario: Suppress
- **WHEN** the operation is suppressed
- **THEN** the edges are sharp again
