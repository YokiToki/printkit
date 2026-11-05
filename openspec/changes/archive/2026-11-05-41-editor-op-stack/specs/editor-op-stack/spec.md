# Spec Delta

## Purpose
Defines the operation stack of an object: editing, ordering, suppression, rollback, apply and flatten, dependencies and recomputation.

## ADDED Requirements

### Requirement: Operation stack
Every object SHALL keep an ordered list of operations applied to its source in order, shown in the properties with one row per operation.

#### Scenario: Add operation
- **WHEN** the user adds Offset 0.2 mm to a box
- **THEN** the object grows by 0.2 mm on every side and a row "Offset 0.2" appears at the end of the stack

#### Scenario: Edit an earlier operation
- **WHEN** the user changes the distance of the first of three operations
- **THEN** all three are evaluated again in order and the object updates

#### Scenario: Reorder
- **WHEN** the user drags an operation above another
- **THEN** the order changes in one history step and the object is recomputed; if an operation now fails it is marked and the rest is skipped

#### Scenario: Suppress
- **WHEN** the user turns the eye of an operation off
- **THEN** the object is evaluated without it and the row is dimmed

#### Scenario: Delete
- **WHEN** the user deletes an operation
- **THEN** the object is recomputed without it and undo restores it

### Requirement: Rollback marker
The stack SHALL have a rollback marker that shows the object as it was after a chosen operation, without deleting the later ones.

#### Scenario: Roll back
- **WHEN** the user moves the marker above the last operation
- **THEN** the view shows the object before that operation, the later rows are dimmed, and exporting uses the shown state with a warning

### Requirement: Failed operations
A failed operation SHALL be marked with its reason, the object SHALL show the result before it, and operations after it SHALL not be evaluated.

#### Scenario: Not a solid
- **WHEN** a Boolean uses an imported mesh with holes as its tool
- **THEN** the row is marked failed, the message names the object and says it is not a closed solid, and the target keeps its previous shape

### Requirement: Dependencies
Operations that use other objects SHALL be evaluated after those objects, cycles SHALL be refused, and deleting a used object SHALL not remove the dependent operations.

#### Scenario: Cycle
- **WHEN** the user makes A subtract B while B already subtracts A
- **THEN** the operation is refused and the message names the cycle

#### Scenario: Deleted tool
- **WHEN** a tool object is deleted
- **THEN** the dependent operation is marked failed with "tool missing" and the rest of the scene is unaffected; undo restores both

### Requirement: Apply and Flatten
The Editor SHALL let the user flatten an object's stack into a single stored mesh, after which it is an ordinary mesh object without operations.

#### Scenario: Flatten
- **WHEN** the user flattens a body with three operations
- **THEN** the visible shape and its volume are unchanged, the stack is empty, the source is a mesh, and undo restores the stack

### Requirement: Recompute performance
Editing operation *k* SHALL re-evaluate only operations *k* to the last, reusing the result of operation *k−1*.

#### Scenario: Cached prefix
- **WHEN** the user edits the last of five operations
- **THEN** only that operation is computed again

### Requirement: Migration of stored sketch features
Scenes stored by the sketch change SHALL load with their Extrude and Revolve features as operations of the stack, and unknown operation kinds SHALL be kept and shown as unknown.

#### Scenario: Old scene
- **WHEN** a scene with a sketch-built plate and a cut hole is loaded
- **THEN** the plate looks the same and the stack lists the two features

#### Scenario: Unknown kind
- **WHEN** a stored operation has an unknown kind
- **THEN** it is shown disabled as "unknown operation" and saved back unchanged
