# Spec Delta

## Purpose
Specifies the non-modal side panel interface and 3D preview for splitting parts to fit printer beds.

## MODIFIED Requirements

### Requirement: Split to bed
The Editor SHALL provide a non-modal tool panel to compute and adjust cuts needed to fit a named object within the printer bed from export settings, display interactive 3D cut planes and bed bounds in the viewport, allow adjusting each cut, and label parts A1, B1…

#### Scenario: Long part
- **WHEN** a 500 × 100 × 40 mm part is split for a 256 mm bed with a 5 mm margin
- **THEN** three parts are created along X, each not longer than 246 mm

#### Scenario: Oversize left
- **WHEN** a part still exceeds the bed after the cuts (for example diagonally)
- **THEN** it is marked oversize with the same warning as in the export panel

#### Scenario: Printer change
- **WHEN** the printer in the export settings is changed
- **THEN** the suggested cuts are recomputed, manual cut positions are kept

#### Scenario: Target object presentation
- **WHEN** the user opens Split to Bed
- **THEN** the panel header names the target object, displays its bounding box dimensions alongside usable bed dimensions, and highlights the target in 3D

#### Scenario: Interactive 3D cut preview
- **WHEN** configuring split cuts
- **THEN** the 3D viewport renders the printer bed footprint beneath the part, displays translucent cut planes with position handles, and shows color-coded candidate parts
