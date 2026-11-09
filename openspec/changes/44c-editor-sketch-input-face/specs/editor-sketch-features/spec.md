# Spec Delta

## Purpose
Specifies automated host-body targeting and directional Join/Cut operations when extruding from face-attached sketches.

## MODIFIED Requirements

### Requirement: Extrude
The Editor SHALL extrude selected profiles of a sketch by a distance on one side, symmetrically, or by two distances, with the operation New body, Join, Cut or Intersect, showing a live preview while the dialog is open. When extruding from a sketch attached to a face of a host body, the Extrude tool SHALL automatically preselect that host body and default to Join when extruding outward or Cut when extruding inward.

#### Scenario: New body
- **WHEN** the user extrudes a 40 × 20 rectangle by 10 mm
- **THEN** a body of 40 × 20 × 10 mm with volume 8000 mm³ is created on the sketch plane, and the sketch is hidden

#### Scenario: Symmetric
- **WHEN** the side is symmetric with distance 10
- **THEN** the body extends 5 mm to each side of the plane

#### Scenario: Cut
- **WHEN** the user extrudes a circle with the operation Cut through a body
- **THEN** a hole is made in that body and no new body is created

#### Scenario: Pick regions
- **WHEN** a sketch has two separate profiles and the user clicks only one in the view
- **THEN** only that profile is extruded

#### Scenario: Zero distance
- **WHEN** the distance is zero or negative
- **THEN** the field shows the limit and the preview is not updated

#### Scenario: Face sketch auto-join
- **WHEN** finishing a sketch on the top face of a 20 mm cube and applying an outward 10 mm extrude
- **THEN** Extrude preselects the cube as target with operation Join, creating a combined 30 mm tall solid

#### Scenario: Face sketch auto-cut
- **WHEN** finishing a sketch on the face of a body and extruding inward with a negative distance into the material
- **THEN** Extrude preselects the body as target with operation Cut
