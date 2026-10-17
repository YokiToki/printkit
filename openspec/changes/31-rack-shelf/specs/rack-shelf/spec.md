# Spec Delta

## Purpose
Defines the rack shelf generator: a 10-inch rack front plate with a shelf, sloped side walls and optional ventilation.

## ADDED Requirements

### Requirement: Shelf structure
The Shelf mode SHALL generate one part consisting of a 10-inch rack front plate (n rack units high with the standard ears, as for panels) and a shelf behind it: a floor flush with the plate's lower edge and two plain side walls standing on the floor edges. The plate, the floor and the walls SHALL form one solid. The user SHALL be able to set the number of units, the plate thickness, the shelf depth, the floor thickness, the side wall height and thickness; the plate corner radius, height tolerance and ear holes are the panel's.

#### Scenario: Default shelf
- **WHEN** the shelf is made with the defaults
- **THEN** the part has a 254 mm wide plate 1 U high less the tolerance (44 mm), open above the floor, a 3 mm floor 100 mm deep behind its lower edge, and two side walls

#### Scenario: One piece
- **WHEN** the shelf is generated
- **THEN** the plate, the floor and the side walls form a single connected solid

#### Scenario: Ears
- **WHEN** the ear settings are changed
- **THEN** the holes in the plate follow them as in the panel mode

### Requirement: Shelf width
The floor SHALL be as wide as the window between the rails (222.25 mm) less a clearance on each side chosen by the user (default 0.25 mm), centred on the plate.

#### Scenario: Default width
- **WHEN** the clearance is 0.25 mm
- **THEN** the floor is 221.75 mm wide, centred between the rails

#### Scenario: Clearance
- **WHEN** the clearance is changed
- **THEN** the floor width changes by twice the change and stays centred

### Requirement: Side walls
The shelf SHALL have a side wall on each side edge of the floor. A wall SHALL be as tall as chosen at the plate and fall in a straight line to the floor at the back of the shelf; it SHALL have no holes and there SHALL be no back wall. A height of 0 SHALL switch the walls off.

#### Scenario: Sloped walls
- **WHEN** the wall height is 30 mm and the shelf is 100 mm deep
- **THEN** each wall is 30 mm tall at the plate and its top edge is a straight line down to the floor at the back

#### Scenario: Walls off
- **WHEN** the wall height is 0
- **THEN** the shelf is the plate and the floor only

#### Scenario: Too tall
- **WHEN** the wall height exceeds the plate height
- **THEN** an error says so and no model is generated

### Requirement: Floor ventilation
The shelf floor SHALL be perforated by default with a through pattern chosen from the panel patterns (slots by default), and the user SHALL be able to choose a solid floor. The pattern SHALL NOT cut the side walls or the rim that keeps the shelf in one piece.

#### Scenario: Default floor
- **WHEN** the shelf is made with the defaults
- **THEN** the floor has through slots

#### Scenario: Solid floor
- **WHEN** the floor pattern is set to none
- **THEN** the floor is solid

#### Scenario: Pattern splits the shelf
- **WHEN** a pattern would split the floor into loose pieces
- **THEN** an error says so and no model is generated

### Requirement: Front plate
The front plate SHALL be open by default, like a sheet-metal shelf: above the floor, between the side walls, nothing remains of the plate except the ears and the strip at the floor. The user SHALL be able to make the plate closed, and a closed plate SHALL be solid by default with an optional through pattern above the floor and between the side walls. The ear holes SHALL keep their standard places.

#### Scenario: Open by default
- **WHEN** the shelf is made with the defaults
- **THEN** the front plate is open above the floor and the shelf is still one solid piece

#### Scenario: Closed plate
- **WHEN** the closed front plate is switched on
- **THEN** the plate closes the front and is solid

#### Scenario: Plate ventilation
- **WHEN** the plate is closed and a pattern is chosen
- **THEN** the pattern is cut through the plate above the floor, between the side walls

### Requirement: Print orientation
The model SHALL be oriented for printing like the enclosure: the front face of the plate lies on the ground plane (z = 0) and the floor and the side walls rise from its back face, so no flipping is required for export.

#### Scenario: On the bed
- **WHEN** the model is shown or exported
- **THEN** the front face of the plate is at z = 0 and the shelf grows upward from it

### Requirement: Shelf persistence
The shelf settings SHALL be remembered between visits, and corrupt stored data SHALL fall back to defaults.

#### Scenario: Reload
- **WHEN** the user changes the shelf settings and reloads
- **THEN** the same settings are restored
