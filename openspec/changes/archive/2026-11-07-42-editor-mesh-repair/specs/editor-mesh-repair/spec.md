# Spec Delta

## Purpose
Defines repairs, Make Solid, Auto repair, Decimate, Smooth and the orientation helpers.

## ADDED Requirements

### Requirement: Individual repairs
The Editor SHALL provide Weld vertices (with tolerance), Remove degenerate and duplicate triangles, Fix orientation, Fill holes (flat or smooth, one loop or all, with a size limit) and Remove small shells, each producing a new mesh in one undo step and reporting what changed.

#### Scenario: Fill a hole
- **WHEN** the user fills the hole of the cube with a missing triangle
- **THEN** the mesh becomes a closed solid with the original volume

#### Scenario: Weld
- **WHEN** a mesh has duplicated vertices at the same positions
- **THEN** after welding the edge counts are consistent and the report gives the number of merged vertices

#### Scenario: Flipped faces
- **WHEN** a shell has inward normals
- **THEN** Fix orientation flips it and the volume becomes positive

#### Scenario: Skipped loop
- **WHEN** a hole loop is longer than the limit
- **THEN** it is left open and listed as skipped

### Requirement: Make Solid
The Editor SHALL offer Make Solid, which rebuilds a closed, manifold, non-self-intersecting surface at a chosen resolution, after showing the estimated memory and warning that fine details may soften.

#### Scenario: Broken mesh
- **WHEN** a mesh with self-intersections and holes is made solid
- **THEN** the result is a valid solid usable in a Boolean

#### Scenario: Too fine
- **WHEN** the chosen resolution would exceed the memory budget
- **THEN** the action is refused with the estimate and a coarser suggestion

### Requirement: Auto repair
The Editor SHALL provide Auto repair that runs the standard sequence and shows a report with a count per step and the before and after status.

#### Scenario: Typical download
- **WHEN** Auto repair runs on a mesh with duplicate vertices, one hole and flipped normals
- **THEN** the result is a valid solid, the report lists the three fixes, and one undo restores the original

#### Scenario: Not repairable
- **WHEN** problems remain
- **THEN** the report lists them and offers Make Solid

### Requirement: Revert to imported
The Editor SHALL keep the first imported mesh of an object and allow reverting to it.

#### Scenario: Revert
- **WHEN** the user repaired and decimated a mesh and chooses Revert to imported
- **THEN** the original mesh returns, also after a reload

### Requirement: Decimate
The Editor SHALL reduce the triangle count to a target or by a tolerance in millimetres, showing the before and after counts and the maximum deviation, and SHALL refuse non-manifold meshes with the reason.

#### Scenario: Reduce
- **WHEN** a 200k-triangle sphere is decimated to 20k triangles
- **THEN** the triangle count is about 20k and the maximum deviation is within the stated tolerance

#### Scenario: Open mesh
- **WHEN** the mesh is open
- **THEN** a message offers Auto repair first

### Requirement: Smooth
The Editor SHALL smooth the surface with a strength and iteration count, keeping boundary loops and sharp edges, without shrinking the volume noticeably.

#### Scenario: Noisy surface
- **WHEN** a noisy scan is smoothed
- **THEN** the noise reduces, sharp edges stay, and the volume changes by less than 1 %

### Requirement: Lay on Face and best orientation
The Editor SHALL lay a picked flat region on the bed and suggest up to three orientations scored by overhang, height and contact area.

#### Scenario: Lay on face
- **WHEN** the user clicks a flat side of a tilted block with Lay on Face
- **THEN** the block rotates until that side is on the bed, as one history step

#### Scenario: Suggestions
- **WHEN** the user opens Best orientation
- **THEN** up to three previews are listed with their scores, and choosing one applies the rotation
