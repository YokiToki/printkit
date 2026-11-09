# Spec Delta

## Purpose
Specifies the adaptive 5×5 hierarchical ground grid behavior during camera zooming.

## MODIFIED Requirements

### Requirement: Ground grid below the model
The ground grid and the build plate overlay SHALL be hidden while the camera is below the XY plane, and shown again when it comes back above; the change SHALL be smooth, not a sudden jump. The ground grid SHALL dynamically subdivide its cell structure into 5×5 minor divisions as the camera approaches, with major lines every 5 minor subdivisions.

#### Scenario: Zooming in reveals finer 5x5 divisions
- **WHEN** the user zooms in closer to a surface
- **THEN** nested 5×5 subdivisions fade in smoothly once on-screen cell spacing exceeds 12 pixels, continuing down to sub-millimetre resolution

#### Scenario: Zooming out collapses divisions
- **WHEN** the user zooms out
- **THEN** minor lines fade out cleanly before becoming dense visual noise, leaving major lines visible

#### Scenario: Camera goes below
- **WHEN** the camera crosses below the XY plane
- **THEN** the grid and the build plate overlay fade out so the underside is not covered

#### Scenario: Camera comes back
- **WHEN** the camera returns above the XY plane
- **THEN** the grid and the build plate overlay are shown again

#### Scenario: Looking along the plane
- **WHEN** the camera is exactly in the XY plane
- **THEN** the grid is hidden or almost invisible, never drawn through the model
