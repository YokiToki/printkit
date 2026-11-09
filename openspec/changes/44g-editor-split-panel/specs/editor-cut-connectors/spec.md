# Spec Delta

## Purpose
Specifies per-cut connector configuration and inspection for multi-axis part splits.

## MODIFIED Requirements

### Requirement: Placement
Connectors SHALL be placed automatically over the cut section, evenly and away from the outline, and SHALL be movable, addable and removable in a section preview with explicit cut selection.

#### Scenario: Two connectors
- **WHEN** count 2 is chosen on a rectangular section
- **THEN** the connectors are spread along the longer side with equal margins

#### Scenario: Drag
- **WHEN** the user drags a connector in the preview
- **THEN** it moves and the check runs again for the new position

#### Scenario: Thin section
- **WHEN** the section is too small for any connector
- **THEN** none is placed and the message says why

#### Scenario: Per-cut section selection
- **WHEN** multiple cuts are defined on an object
- **THEN** the user can select an individual cut by its coordinate to view its specific cross-section and configure connectors for that mating boundary
