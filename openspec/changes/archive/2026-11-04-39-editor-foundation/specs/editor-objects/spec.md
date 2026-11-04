# Spec Delta

## Purpose
Defines scene objects, STL import, primitives, the outliner, the properties panel and the mesh health summary.

## ADDED Requirements

### Requirement: STL import
The Editor SHALL import binary and ASCII STL files from a file dialog and by dropping them on the view, several at once. Each file SHALL become one object named after the file.

#### Scenario: Import one file
- **WHEN** the user drops a 60 × 40 × 20 mm STL on the view
- **THEN** an object appears centred in X and Y with its lowest point on the bed, selected, and the camera frames it if the scene was empty

#### Scenario: Several files
- **WHEN** the user drops three files
- **THEN** three objects are created side by side with 10 mm gaps and each import is logged with name and size

#### Scenario: Inches
- **WHEN** the user imports with the unit set to inches
- **THEN** the coordinates are multiplied by 25.4

#### Scenario: Bad file
- **WHEN** the file is not a valid STL
- **THEN** nothing is added, an error is shown and logged, and other files of the same drop are still imported

#### Scenario: Suspicious size
- **WHEN** the imported mesh is smaller than 1 mm or larger than 1000 mm in its longest side
- **THEN** a notice names the size and offers the other unit

### Requirement: Open meshes are accepted
The Editor SHALL accept meshes that are not closed solids and SHALL show a health summary: closed or open, number of open edges, non-manifold edges, degenerate triangles, and whether the volume is negative.

#### Scenario: Open mesh
- **WHEN** an imported mesh has holes
- **THEN** the object is flagged in the outliner, the properties show the counts, and viewing, moving and exporting still work

#### Scenario: Closed mesh
- **WHEN** a mesh is a closed solid
- **THEN** the properties show its volume and triangle count and no flag

### Requirement: Primitives
The Editor SHALL add box, cylinder, sphere, cone, torus and wedge objects with parameters in millimetres, editable after creation.

#### Scenario: Add
- **WHEN** the user chooses Add → Cylinder
- **THEN** a cylinder with default parameters stands on the bed at the view centre and is selected

#### Scenario: Edit parameters
- **WHEN** the user changes the cylinder's diameter in the properties
- **THEN** only that object is rebuilt and its position and rotation are kept

#### Scenario: Invalid parameter
- **WHEN** a parameter would make the shape empty (zero or negative size)
- **THEN** the field shows the limit and the object keeps its previous mesh

### Requirement: Outliner
The outliner SHALL list objects in creation order with name, visibility toggle, lock toggle and flags, and SHALL support rename, select, multi-select, duplicate, delete, hide, show all and isolate.

#### Scenario: Hide
- **WHEN** the user hides an object
- **THEN** it disappears from the view, is not exported, and stays in the list dimmed

#### Scenario: Lock
- **WHEN** an object is locked
- **THEN** it cannot be picked in the view or moved, but can be selected in the list and unlocked

#### Scenario: Duplicate
- **WHEN** the user duplicates an object
- **THEN** a copy named "<name> 2" with the same source and a 10 mm offset in X is created and selected, sharing the same stored mesh

### Requirement: Properties
The properties panel SHALL show the selected object's name, colour, source parameters, health and, for several selected objects, the common transform and count.

#### Scenario: Nothing selected
- **WHEN** no object is selected
- **THEN** the panel shows the scene summary (object count, overall bounding box in the shown unit)

### Requirement: Export of the scene
The Editor SHALL export all visible objects or only the selection through the existing export panel, one part per object, with each object's transform applied.

#### Scenario: Selected only
- **WHEN** two of four objects are selected and "Selection only" is on
- **THEN** the exported file or plate contains exactly those two, at the positions seen in the view relative to each other

#### Scenario: Open mesh warning
- **WHEN** an exported object is an open mesh
- **THEN** a warning in the panel and the log names it, and the export still proceeds
