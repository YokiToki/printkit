# model-export Specification

## Purpose
Defines file export of generated models in STL and 3MF formats.

## Requirements

### Requirement: STL export
The app SHALL export the current model as a binary STL, either as one file or, for multi-part models, one file per part or a single combined file, in millimetres.

#### Scenario: Single model
- **WHEN** the user exports STL for a single-part model
- **THEN** one binary STL downloads with a name containing the mode and size

#### Scenario: Multi-part
- **WHEN** a split baseplate has 4 parts and the user chooses one file per part
- **THEN** four STL files are produced with part labels in their names

### Requirement: 3MF export
The app SHALL export a valid 3MF package containing every part as a named object, in millimetres, that opens in common slicers.

#### Scenario: Parts present
- **WHEN** a split baseplate with 4 parts is exported to 3MF
- **THEN** the package contains 4 objects named by their labels

#### Scenario: Valid package
- **WHEN** the 3MF is re-read by the test suite
- **THEN** its model XML is well formed, vertices/triangles counts match the source meshes and the unit is millimetre

### Requirement: Plate arrangement
In 3MF export parts SHALL be placed on the virtual plate inside the selected bed without overlapping, using their print orientation.

#### Scenario: Arrangement
- **WHEN** four parts that fit the bed are exported
- **THEN** each part's footprint lies within the bed and parts do not overlap

#### Scenario: Does not fit
- **WHEN** parts cannot all fit on one bed
- **THEN** they are distributed across several plates or the user is warned

### Requirement: Print orientation
The export SHALL orient each part to print on its flattest suitable face by default (e.g. smooth-top models flipped) and let the user override orientation per model.

#### Scenario: Flip
- **WHEN** orientation is set to flipped
- **THEN** the exported geometry is rotated 180° about the horizontal axis and rests on the bed

### Requirement: Local processing
Export SHALL run entirely in the browser; no model data leaves the device.

#### Scenario: Offline
- **WHEN** the network is disconnected after load
- **THEN** export still succeeds

### Requirement: Export panel layout
The parameter panel footer SHALL present export controls in a compact toolbar layout that minimizes vertical footprint. Format selection, printer selection, and the primary download action SHALL be integrated with tight padding and clear status indication.

#### Scenario: Compact footer footprint
- **WHEN** the export panel is rendered in the parameter sidebar footer
- **THEN** it occupies a compact vertical space with reduced padding, keeping the download action primary and easily accessible

#### Scenario: Status indication
- **WHEN** the model layout status changes (building, fits, or plate overflow)
- **THEN** status feedback is displayed cleanly alongside or within the compact export controls without displacing the primary action
