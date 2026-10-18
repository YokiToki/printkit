# rack-enclosure Specification

## Purpose
Defines the rack enclosure generator: a 10-inch rack front plate with a shell that holds a device.

## Requirements

### Requirement: Enclosure size
The Enclosure mode SHALL generate one part from the device's width, depth and height, a gap between the device and the shell, a shell wall thickness and a front plate thickness: a 10-inch rack front plate with the standard ears (as for panels) and a shell behind it that surrounds the device on the top, bottom and sides, open at the back. The plate height SHALL be the smallest whole number of rack units that contains the shell and the height tolerance, shown to the user, and the user MAY choose a larger number of units.

#### Scenario: Automatic units
- **WHEN** a device 120 mm high is entered with a 0.4 mm gap and 2 mm walls
- **THEN** the shell is 124.8 mm high and the plate is 3 U high (133.35 mm less the tolerance), and the count is shown

#### Scenario: Forced units
- **WHEN** the user sets more units than needed
- **THEN** the plate is that many units high and the shell stays centred on the plate

#### Scenario: Too wide
- **WHEN** the device plus gap and walls is wider than the 222.25 mm window between the rails
- **THEN** an error states how many millimetres too wide it is and no model is generated

#### Scenario: Print orientation
- **WHEN** the model is shown or exported
- **THEN** the outer face of the front plate lies on the ground plane (z = 0) and the shell rises from its back, so the part prints front-face down

#### Scenario: Shell depth
- **WHEN** the depth is set
- **THEN** the shell extends behind the front plate by the device depth plus the gap

### Requirement: Front window
The front plate SHALL have a window that shows the device's front face by default: the device's width and height reduced on every side by a front lip chosen by the user, so the plate overlaps the device's edge by that amount. The user SHALL be able to switch the window off to get a closed front plate.

#### Scenario: Window by default
- **WHEN** the enclosure is made with the default settings
- **THEN** the front plate has the window

#### Scenario: Lip
- **WHEN** the window is on with a 3 mm lip
- **THEN** the window is 6 mm narrower and 6 mm lower than the device

#### Scenario: No window
- **WHEN** the window is switched off
- **THEN** the front plate is closed

### Requirement: Front plate extras
The user SHALL be able to add openings to the front plate in groups. A group has a kind (keystone socket or round hole), a count, how many per row and a zone (left or right of the shell, above or below it); a round hole group has its own diameter. One item per row SHALL give a column, as many per row as items a row, and anything between a grid. Several groups SHALL be possible, in the same or in different zones. Openings SHALL stay inside the plate, clear of the ears, the window, the shell and each other, otherwise a message says which group does not fit and it is not cut. The round holes SHALL be called holes in the interface, without reference to cables, and the block SHALL have its own heading.

#### Scenario: Keystones
- **WHEN** two keystone sockets are added in the right zone
- **THEN** two sockets of the measured size are made in the front plate beside the shell

#### Scenario: Column and row
- **WHEN** two keystone groups of three are added to the right zone, one with one per row and one with three per row
- **THEN** the first is three sockets one above another and the second three in a row, placed one after the other from the shell outward

#### Scenario: Grid
- **WHEN** a group of six keystones has three per row
- **THEN** the sockets form two rows of three, centred in the zone

#### Scenario: Holes
- **WHEN** a hole group of two holes of 8 mm is added to the left zone
- **THEN** two 8 mm holes are cut there

#### Scenario: Overlap
- **WHEN** a group would overlap the window, an ear hole, the shell or another group
- **THEN** a message names the group and it is not cut

#### Scenario: Old settings
- **WHEN** settings saved with the single keystone and cable-hole fields are loaded
- **THEN** they become equivalent groups and the plate is the same

### Requirement: Keystone mount
A keystone socket SHALL hold a standard keystone module: an opening with the ramp and the latch notch measured from the reference models, and a collar behind the front plate that gives the module depth to snap into. A bare rectangle of the module's size SHALL NOT be used.

#### Scenario: Socket profile
- **WHEN** a keystone socket is made
- **THEN** the plate has the module's opening, and behind it a collar with the ramp on one edge and the latch notch on the opposite edge, joined to the plate

#### Scenario: Spacing
- **WHEN** several sockets are placed in a row or a column
- **THEN** the distance between neighbours leaves the collars apart by a gap, not closer than the collar size

#### Scenario: Fit
- **WHEN** the collar would reach the shell or an ear
- **THEN** a message says the group does not fit and it is not cut

### Requirement: Ventilation
The user SHALL be able to add hexagonal vents to the top and side walls of the shell with their own hexagon width and wall thickness; the shell SHALL keep its structure (vents only in the free wall area, away from the edges and the plate).

#### Scenario: Vents on
- **WHEN** vents are enabled
- **THEN** the top and both side walls have hexagonal holes of the chosen size, none within a margin of the edges

#### Scenario: Strength
- **WHEN** the vent wall is below the minimum printable width
- **THEN** a warning names the setting

### Requirement: Enclosure persistence
The enclosure settings SHALL be remembered between visits, and corrupt stored data SHALL fall back to defaults.

#### Scenario: Reload
- **WHEN** the user changes the enclosure settings and reloads
- **THEN** the same settings are restored
