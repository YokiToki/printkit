# Spec Delta

## Purpose
Defines connectors on cut faces: pegs, pin and magnet sockets, dovetails, their placement and checks.

## ADDED Requirements

### Requirement: Connector types
The Editor SHALL offer connectors on a cut face: integrated alignment pegs with sockets, holes for separate pins or filament, magnet pockets, and dovetails, with size, depth and clearance, using the presets of the baseplate connectors.

#### Scenario: Peg
- **WHEN** a peg connector of 4 mm diameter and 8 mm length is added
- **THEN** part A has a peg of 4 mm and part B a socket larger by the clearance and slightly deeper

#### Scenario: Filament hole
- **WHEN** the filament preset is chosen
- **THEN** both parts get a hole of 1.9 mm diameter and the default depth

#### Scenario: Magnet pockets
- **WHEN** the magnet preset 6 × 2 is chosen
- **THEN** both parts get a pocket of the magnet size plus tolerance

#### Scenario: Dovetail
- **WHEN** a dovetail is chosen on a section with a straight run of enough length
- **THEN** part A has the key and part B the socket with clearance, and the parts join by sliding

### Requirement: Placement
Connectors SHALL be placed automatically over the cut section, evenly and away from the outline, and SHALL be movable, addable and removable in a section preview.

#### Scenario: Two connectors
- **WHEN** count 2 is chosen on a rectangular section
- **THEN** the connectors are spread along the longer side with equal margins

#### Scenario: Drag
- **WHEN** the user drags a connector in the preview
- **THEN** it moves and the check runs again for the new position

#### Scenario: Thin section
- **WHEN** the section is too small for any connector
- **THEN** none is placed and the message says why

### Requirement: Fit checks
Each connector SHALL be checked to lie fully inside both parts for its depth; problems SHALL be reported by key with the connector number and shown in red, and the connector SHALL be skipped.

#### Scenario: Leaves the part
- **WHEN** a manually placed peg would leave the part
- **THEN** it is skipped with the "outside" message

#### Scenario: Too little material
- **WHEN** less than 2 mm of material lies behind the cut at a connector
- **THEN** it is skipped with the "thin" message

### Requirement: Loose pins
Connectors of the pin kind SHALL be exportable as separate small parts.

#### Scenario: Include pins
- **WHEN** Include pins is on and the scene is exported
- **THEN** one pin part per pin connector is included and named
