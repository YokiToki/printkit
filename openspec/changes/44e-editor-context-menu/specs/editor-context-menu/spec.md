# Spec Delta

## Purpose
Defines the context menu behavior, target resolution, and menu actions across 3D objects, faces, edges, canvas space, and 2D sketches.

## ADDED Requirements

### Requirement: 3D Scene Context Menu
The 3D Viewport SHALL open a context menu on right-click without drag on 3D objects, faces, edges, and empty space, presenting relevant actions according to the clicked target.

#### Scenario: Object context menu
- **WHEN** the user right-clicks on an unselected 3D object
- **THEN** the object is selected and the menu offers Rename, Hide, Duplicate, Delete, Fit, Operations, and Repair

#### Scenario: Empty space context menu
- **WHEN** the user right-clicks on empty background in the 3D viewport
- **THEN** the menu offers Add Primitive, Import, New Sketch on plane, Show All, and Fit All

#### Scenario: Face context menu
- **WHEN** the user right-clicks on a planar face
- **THEN** the menu offers New Sketch on Face, Push/Pull, Lay on Bed, and Measure

#### Scenario: Edge context menu
- **WHEN** the user right-clicks on an edge
- **THEN** the menu offers Fillet, Chamfer, and Select Edge Chain

### Requirement: Sketch Canvas Context Menu
The 2D sketch canvas SHALL open a context menu on right-click without drag, presenting valid geometric constraints and operations for clicked entities or canvas actions on empty space.

#### Scenario: Entity context menu
- **WHEN** the user right-clicks on a sketch curve or point
- **THEN** the menu offers applicable geometric constraints (Horizontal, Vertical, Tangent, Dimension), Construction toggle, and Delete

#### Scenario: Empty sketch canvas context menu
- **WHEN** the user right-clicks on empty space in sketch mode
- **THEN** the menu offers drawing tool shortcuts, View Normal to Sketch, Finish Sketch, and Cancel Sketch

### Requirement: Camera Drag Disambiguation
The viewport SHALL distinguish camera orbit and pan gestures using the right mouse button from context menu invocations.

#### Scenario: Right button drag
- **WHEN** the user presses the right mouse button and moves the cursor more than 4 pixels before releasing
- **THEN** the camera navigates and no context menu opens
