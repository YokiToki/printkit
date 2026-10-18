# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
