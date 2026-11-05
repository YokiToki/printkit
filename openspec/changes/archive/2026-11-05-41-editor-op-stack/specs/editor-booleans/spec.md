# Spec Delta

## Purpose
Defines boolean operations between objects, tool objects and the Combine command.

## ADDED Requirements

### Requirement: Boolean operations
The Editor SHALL provide Union, Subtract and Intersect of an object with one or more tool objects, evaluated in the target's local space with the tools' own stacks and transforms applied.

#### Scenario: Subtract
- **WHEN** a cylinder tool is subtracted from a box
- **THEN** the box has a hole where the cylinder was and the volume decreases by the overlap volume

#### Scenario: Move the tool
- **WHEN** the user moves the tool cylinder afterwards
- **THEN** the hole moves with it

#### Scenario: Transformed target
- **WHEN** the target box is rotated 30° and the tool is not
- **THEN** the cut stays in the same place in the scene

#### Scenario: Intersect
- **WHEN** two overlapping boxes are intersected
- **THEN** the result is their common volume

### Requirement: Closed solids only
Boolean operations SHALL require closed solid operands and SHALL explain what is wrong otherwise.

#### Scenario: Open mesh
- **WHEN** a tool mesh has open edges
- **THEN** the operation fails with the object name and the number of open edges

### Requirement: Combine command
The Editor SHALL provide Combine for the selection (Union, Subtract, Intersect) using the active object as the target, as one history step.

#### Scenario: Combine three
- **WHEN** three objects are selected with the first active and Union is chosen
- **THEN** the first object gets a Union operation with the other two as tools, and they are hidden as tools

#### Scenario: Release
- **WHEN** the user releases a tool
- **THEN** the operation is removed and the tool object is visible again at its place

### Requirement: Tool display and export
Tool objects SHALL be drawn as translucent ghosts when visible, marked in the outliner, and left out of exports unless explicitly selected.

#### Scenario: Export
- **WHEN** the scene is exported with all visible objects
- **THEN** the result bodies are exported and the tool objects are not

#### Scenario: Ghost
- **WHEN** a tool object is visible
- **THEN** it is translucent and clicking through it selects the body behind it first
