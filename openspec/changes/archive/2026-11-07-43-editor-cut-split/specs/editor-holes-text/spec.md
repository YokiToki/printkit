# Spec Delta

## Purpose
Defines the hole tool with fastener presets and text on faces.

## ADDED Requirements

### Requirement: Hole tool
The Editor SHALL place a hole where the user clicks a surface, along the surface normal, with the types simple, counterbore, countersink, magnet pocket and heat-insert pocket, blind or through, using presets for common screws, inserts and magnets with a tolerance, and numeric position fields.

#### Scenario: Place a screw hole
- **WHEN** the user clicks a top face and chooses M3 clearance, through
- **THEN** a hole of the M3 clearance diameter goes through the part along the face normal

#### Scenario: Counterbore
- **WHEN** the counterbore type is chosen for an M3 socket head
- **THEN** the head recess has the preset diameter and depth over the clearance hole

#### Scenario: Magnet pocket
- **WHEN** a 6 × 2 magnet pocket is placed
- **THEN** the pocket is the magnet size plus tolerance and 2 mm deep plus tolerance

#### Scenario: Inclined face
- **WHEN** the face is tilted 30°
- **THEN** the hole axis follows the face normal

#### Scenario: Type the position
- **WHEN** the user types offsets of 10 and 5 mm in the face plane
- **THEN** the hole moves to that position

#### Scenario: Array
- **WHEN** the hole operation is combined with a linear pattern of `41`
- **THEN** the holes repeat with the given spacing

### Requirement: Hole is an operation
A hole SHALL be an editable operation in the object's stack with its position stored in object space, so changing the source or reordering recomputes it.

#### Scenario: Edit diameter
- **WHEN** the user changes the hole size later
- **THEN** the hole updates without losing its position

#### Scenario: Missing material
- **WHEN** the stored position no longer lies on the surface
- **THEN** the operation still cuts where the tool volume meets material and reports a warning if nothing is cut

### Requirement: Text on a face
The Editor SHALL emboss or engrave text at a picked surface point with font, size, spacing, alignment, rotation and depth or height, as an editable stack operation.

#### Scenario: Engrave
- **WHEN** the user engraves "A1" 1 mm deep on a flat top face
- **THEN** the text is cut 1 mm into the surface

#### Scenario: Emboss
- **WHEN** the user embosses text 0.8 mm high
- **THEN** the text stands 0.8 mm above the surface and is fused with the body

#### Scenario: Curved surface
- **WHEN** the text extends over a surface that deviates more than the text depth
- **THEN** a warning says the text is projected flat

#### Scenario: Cyrillic and Latin
- **WHEN** a font without the needed glyphs is chosen
- **THEN** the same fallback as in the keychain text applies and a notice is shown

#### Scenario: Fine strokes
- **WHEN** the strokes are thinner than the nozzle allows
- **THEN** the thin-stroke warning is shown
