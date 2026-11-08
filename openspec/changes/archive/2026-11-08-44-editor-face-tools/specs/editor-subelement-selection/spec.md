# Spec Delta

## Purpose
Defines selecting faces and edges of a mesh object and the references that operations store.

## ADDED Requirements

### Requirement: Selection modes
The Editor SHALL provide Object, Face and Edge selection modes switchable from the tool bar and by hotkeys, with the available operations following the mode and selection.

#### Scenario: Switch mode
- **WHEN** the user switches to Face mode
- **THEN** hovering a surface highlights a face region and clicking selects it

#### Scenario: Back to objects
- **WHEN** the user switches back to Object mode
- **THEN** the sub-element selection is cleared and the object selection is kept

### Requirement: Face regions
In Face mode a click SHALL select a flat region (coplanar triangles within tolerance) or, on smooth surfaces, a smooth patch, with Shift adding regions and double click growing to tangent-connected regions.

#### Scenario: Box face
- **WHEN** the user clicks the top of a box
- **THEN** the whole top face is highlighted, however many triangles it has

#### Scenario: Cylinder side
- **WHEN** the user clicks the side of a cylinder
- **THEN** the whole smooth side is highlighted as one face and described as cylindrical

#### Scenario: Add
- **WHEN** the user Shift-clicks a second face
- **THEN** both are selected and the status bar shows the count and total area

### Requirement: Edge chains
In Edge mode a click SHALL select a chain of sharp edges, classified as straight, circular or free, with a threshold for sharpness that the user can change.

#### Scenario: Rim of a cylinder
- **WHEN** the user clicks the top rim of a cylinder
- **THEN** the full circle is selected and described as a circle with its diameter

#### Scenario: Box edge
- **WHEN** the user clicks an edge of a box
- **THEN** that straight edge is selected with its length

#### Scenario: Threshold
- **WHEN** the user lowers the sharpness threshold on a gently curved part
- **THEN** more edges become selectable

### Requirement: Stable references
Operations SHALL store faces and edges as geometric references and resolve them against the current shape, failing with a reason when zero or several elements match.

#### Scenario: Source edited
- **WHEN** a feature earlier in the stack changes size slightly
- **THEN** a dependent Push/Pull still finds its face

#### Scenario: Face gone
- **WHEN** the referenced face no longer exists
- **THEN** the operation is marked failed with "face not found" and the rest of the stack is skipped

#### Scenario: Ambiguous
- **WHEN** two faces match the reference
- **THEN** the operation fails with "ambiguous face" and the user can re-pick

### Requirement: Limits
Face and edge modes SHALL work on meshes up to a triangle limit and report a clear message above it.

#### Scenario: Huge mesh
- **WHEN** the mesh exceeds the limit
- **THEN** the modes are unavailable with a message suggesting Decimate
