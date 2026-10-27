# Spec Delta

## Purpose
Defines cutting a model with a plane, slicing, splitting to the printer bed and the derived parts.

## ADDED Requirements

### Requirement: Plane Cut
The Editor SHALL cut a closed solid with a plane defined by an axis and position, by the gizmo in any orientation, by a picked flat face, or by three points, producing capped parts.

#### Scenario: Axis cut
- **WHEN** a 40 mm cube is cut at Z = 15
- **THEN** two closed parts of 15 mm and 25 mm height are created and their volumes add up to the original

#### Scenario: Keep one side
- **WHEN** the user chooses Keep upper side
- **THEN** only the part above the plane remains, with a flat closed cut face

#### Scenario: Slice into N
- **WHEN** the user slices a 90 mm part into 3 along X
- **THEN** three parts of 30 mm are created

#### Scenario: From a face
- **WHEN** the user picks a flat face as the cutting plane
- **THEN** the plane is placed on that face and can be offset by a typed distance

#### Scenario: Open mesh
- **WHEN** the object is not a closed solid
- **THEN** the cut is refused with the reason and a Repair action

### Requirement: Derived parts
Parts of a cut SHALL stay linked to the source object and the cut definition, so changing the plane, a connector or the source updates all parts; the source SHALL be hidden but kept and restorable.

#### Scenario: Move the plane
- **WHEN** the user changes the cut position from 15 to 20 mm
- **THEN** both parts are recomputed and the connectors stay on the new cut face

#### Scenario: Remove the cut
- **WHEN** the user deletes the cut group
- **THEN** the parts disappear and the source object is visible again

#### Scenario: Reload
- **WHEN** the page is reloaded
- **THEN** the parts are rebuilt from the stored cut definition

### Requirement: Split to bed
The Editor SHALL compute the cuts needed to fit every part within the printer bed minus margin from the export settings, spread them evenly, allow adjusting each cut, and label parts A1, B1…

#### Scenario: Long part
- **WHEN** a 500 × 100 × 40 mm part is split for a 256 mm bed with a 5 mm margin
- **THEN** three parts are created along X, each not longer than 246 mm

#### Scenario: Oversize left
- **WHEN** a part still exceeds the bed after the cuts (for example diagonally)
- **THEN** it is marked oversize with the same warning as in the export panel

#### Scenario: Printer change
- **WHEN** the printer in the export settings is changed
- **THEN** the suggested cuts are recomputed, manual cut positions are kept

### Requirement: Exploded view
Cut groups SHALL offer an exploded view with a gap slider for inspection that does not affect exports.

#### Scenario: Explode
- **WHEN** the gap is set to 10 mm
- **THEN** the parts move apart in the view and exporting uses the assembled positions
