# Spec Delta

## Purpose
Specifies on-model defect highlighting, slicer readiness assessment, and filament material estimation for mesh health diagnostics.

## MODIFIED Requirements

### Requirement: Detailed diagnosis
For a mesh object the Editor SHALL report the number of triangles and vertices, open edges grouped into boundary loops with their perimeter, non-manifold edges and vertices, degenerate and duplicate triangles, triangles with inconsistent or flipped orientation, whether the volume is negative, the number of separate shells with their volumes, the surface area and volume, render defect lines directly on the model, assess readiness for 3D slicers, and estimate required filament weight and length.

#### Scenario: Cube with a hole
- **WHEN** a cube with one triangle missing is analysed
- **THEN** one boundary loop of three edges is reported and the mesh is marked open

#### Scenario: Two shells
- **WHEN** a mesh consists of a cube and a floating small sphere
- **THEN** two shells are reported with their volumes

#### Scenario: Clean mesh
- **WHEN** the mesh is a closed manifold solid
- **THEN** the panel says it is a valid solid and shows volume and area

#### Scenario: Defect line overlay
- **WHEN** analyzing a mesh with open loops and non-manifold edges
- **THEN** open edges are highlighted directly on the 3D surface in red and non-manifold edges in yellow

#### Scenario: Slicer readiness audit
- **WHEN** diagnosis completes
- **THEN** the panel reports whether the model is watertight and ready for Bambu Studio, OrcaSlicer, PrusaSlicer, and Cura

#### Scenario: Filament estimator
- **WHEN** the user selects material PLA and infill 20%
- **THEN** the calculated filament mass in grams and extrusion length in metres are displayed based on model volume
