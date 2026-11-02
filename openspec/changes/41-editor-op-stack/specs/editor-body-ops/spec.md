# Spec Delta

## Purpose
Defines mirror, patterns, offset and hollow as stack operations.

## ADDED Requirements

### Requirement: Mirror
The Editor SHALL mirror the body about a plane through the object origin, the bounding-box centre or a given offset, merged into one solid or as separate shells.

#### Scenario: Merge
- **WHEN** a half of a symmetric part touching the plane is mirrored with merge on
- **THEN** the result is one solid whose volume is twice the half

#### Scenario: Separate shells
- **WHEN** merge is off
- **THEN** both shells are in the object and no union is computed

### Requirement: Patterns
The Editor SHALL repeat the body linearly (count, spacing or total length, optionally symmetric about the origin) or circularly (count, axis, full or partial angle), merged or as separate shells.

#### Scenario: Linear
- **WHEN** a 10 mm cube is repeated 4 times with spacing 20 mm along X
- **THEN** the bounding box is 70 mm long and the volume is 4000 mm³

#### Scenario: Circular
- **WHEN** a peg is repeated 6 times over 360° about Z
- **THEN** the pegs are 60° apart

#### Scenario: Hole array
- **WHEN** a cylinder tool has a linear pattern and is subtracted from a plate
- **THEN** the plate has one hole per copy

#### Scenario: Too many
- **WHEN** the repeat would exceed the triangle limit
- **THEN** the operation fails with the limit and the reached count

### Requirement: Offset
The Editor SHALL grow or shrink the body by a distance in millimetres, guaranteeing that a shrink does not leave less than the requested wall and a grow does not exceed the requested size.

#### Scenario: Grow for clearance
- **WHEN** a 20 mm cube is offset by +0.2 mm
- **THEN** its bounding box is 20.4 mm on each axis

#### Scenario: Shrink to nothing
- **WHEN** the shrink distance removes the whole body
- **THEN** the operation fails with a message that the distance is too large

### Requirement: Hollow
The Editor SHALL hollow a body with a wall thickness and optional drain holes with a position, direction and diameter.

#### Scenario: Hollow cube
- **WHEN** a 30 mm cube is hollowed with a 2 mm wall
- **THEN** the cavity is a 26 mm cube and the volume is 27000 − 17576 mm³ within tolerance

#### Scenario: Drain hole
- **WHEN** a drain of 3 mm is added on the bottom face
- **THEN** the cavity is open to the outside through that hole

#### Scenario: Wall too thick
- **WHEN** the wall is larger than half the thinnest part
- **THEN** the operation fails with the largest allowed wall
