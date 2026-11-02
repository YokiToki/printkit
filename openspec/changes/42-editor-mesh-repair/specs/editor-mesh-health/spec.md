# Spec Delta

## Purpose
Defines the detailed diagnosis of a mesh and how problems are listed and shown.

## ADDED Requirements

### Requirement: Detailed diagnosis
For a mesh object the Editor SHALL report the number of triangles and vertices, open edges grouped into boundary loops with their perimeter, non-manifold edges and vertices, degenerate and duplicate triangles, triangles with inconsistent or flipped orientation, whether the volume is negative, the number of separate shells with their volumes, and the surface area and volume.

#### Scenario: Cube with a hole
- **WHEN** a cube with one triangle missing is analysed
- **THEN** one boundary loop of three edges is reported and the mesh is marked open

#### Scenario: Two shells
- **WHEN** a mesh consists of a cube and a floating small sphere
- **THEN** two shells are reported with their volumes

#### Scenario: Clean mesh
- **WHEN** the mesh is a closed manifold solid
- **THEN** the panel says it is a valid solid and shows volume and area

### Requirement: Show problems
Each reported problem SHALL be listed and, when selected, highlighted in the view and framed by the camera.

#### Scenario: Show a hole
- **WHEN** the user clicks a boundary loop in the list
- **THEN** its edges are drawn highlighted, and the camera frames the loop

### Requirement: Self-intersections
The Editor SHALL detect self-intersecting triangles on request, report their count and highlight them, showing progress and allowing cancellation.

#### Scenario: Cancel
- **WHEN** the user cancels a running intersection check
- **THEN** the job ends, the log says cancelled, and the editor stays responsive

#### Scenario: Large mesh
- **WHEN** the candidate pair count exceeds the limit
- **THEN** the check stops with a message that gives the limit and does not freeze the page

### Requirement: Diagnosis does not change the mesh
Analysis SHALL NOT modify the mesh or create history steps.

#### Scenario: Analyse
- **WHEN** the user opens the health details
- **THEN** the undo history is unchanged
