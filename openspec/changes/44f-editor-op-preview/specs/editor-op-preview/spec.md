# Spec Delta

## Purpose
Defines the real-time translucent operation preview and on-canvas interactive manipulation handles for solid modeling operations.

## ADDED Requirements

### Requirement: Real-Time Translucent Preview
The Editor SHALL display a translucent preview body of solid modeling operations (Extrude, Revolve, Push/Pull, and Edge Fillet/Chamfer) in the 3D viewport while their parameter dialog is open, updating dynamically as distances and options change.

#### Scenario: Extrude join preview
- **WHEN** configuring an outward Extrude with operation Join
- **THEN** a translucent accent-colored body representing the extruded volume is rendered extending from the profile

#### Scenario: Extrude cut preview
- **WHEN** configuring an inward Extrude with operation Cut
- **THEN** a translucent red body representing the volume being subtracted is rendered intersecting the target solid

#### Scenario: Push/pull preview
- **WHEN** dragging the push/pull distance slider on a planar face
- **THEN** the face's projected displacement is rendered dynamically before committing

### Requirement: Interactive On-Canvas Drag Handle
Operations with directional distances SHALL display an interactive 3D arrow handle along their normal vector that can be dragged directly in the viewport.

#### Scenario: Dragging extrusion handle
- **WHEN** the user drags the arrow handle along the extrusion vector
- **THEN** the distance updates continuously with grid snapping, and the numeric field in the dialog synchronizes

### Requirement: Preview Isolation
Preview bodies SHALL NOT be added to the scene document, SHALL NOT affect bounding box calculations or measurements, and SHALL NOT be included in STL or 3MF exports.

#### Scenario: Canceling operation
- **WHEN** the user presses Cancel or Escape in an operation dialog
- **THEN** the translucent preview body is instantly removed from the viewport without leaving residual geometry
