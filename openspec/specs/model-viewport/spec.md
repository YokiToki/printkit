# model-viewport Specification

## Purpose
Defines how the 3D preview is navigated and what is drawn around the model.

## Requirements

### Requirement: Orbit through the ground plane
The user SHALL be able to orbit the camera through the XY plane and view the model from below and from any direction, while the view keeps Z up.

#### Scenario: View from below
- **WHEN** the user drags the view so that the camera goes below the XY plane
- **THEN** the camera continues under the model and shows its underside

#### Scenario: Bottom view from the gizmo
- **WHEN** the user selects the negative Z end of the axis gizmo
- **THEN** the camera looks straight at the underside of the model

#### Scenario: No flipping
- **WHEN** the camera passes directly above or below the model
- **THEN** the view does not roll or flip upside down

### Requirement: Ground grid below the model
The ground grid and the build plate overlay SHALL be hidden while the camera is below the XY plane, and shown again when it comes back above; the change SHALL be smooth, not a sudden jump. The ground grid SHALL dynamically subdivide its cell structure into 5×5 minor divisions as the camera approaches, with major lines every 5 minor subdivisions.

#### Scenario: Zooming in reveals finer 5x5 divisions
- **WHEN** the user zooms in closer to a surface
- **THEN** nested 5×5 subdivisions fade in smoothly once on-screen cell spacing exceeds 12 pixels, continuing down to sub-millimetre resolution

#### Scenario: Zooming out collapses divisions
- **WHEN** the user zooms out
- **THEN** minor lines fade out cleanly before becoming dense visual noise, leaving major lines visible

#### Scenario: Camera goes below
- **WHEN** the camera crosses below the XY plane
- **THEN** the grid and the build plate overlay fade out so the underside is not covered

#### Scenario: Camera comes back
- **WHEN** the camera returns above the XY plane
- **THEN** the grid and the build plate overlay are shown again

#### Scenario: Looking along the plane
- **WHEN** the camera is exactly in the XY plane
- **THEN** the grid is hidden or almost invisible, never drawn through the model

### Requirement: Underside lighting
Faces that point down SHALL be lit well enough to read their shape, so holes and pockets on the underside are visible.

#### Scenario: Magnet pockets
- **WHEN** a bin with magnet pockets is viewed from below
- **THEN** the pockets are visible as shaded recesses, not as a black underside

### Requirement: Cutting tool overlay
In Cutout mode the 3D view SHALL show each visible cutout's shape as a translucent body in that cutout's own colour, different from the model colour, standing where it is cut, so the user sees what is being subtracted and which cutout it is. The bodies are preview only and SHALL NOT be part of the model measurements, volume or any export.

#### Scenario: Rectangle and part shown
- **WHEN** a rectangle or an imported part is added to a cutout
- **THEN** a translucent body of that shape is drawn inside its pocket

#### Scenario: Colour of each tool
- **WHEN** several cutouts exist
- **THEN** each translucent body has the colour of its cutout, the same as the swatch in the list and the shape in the top view

#### Scenario: Follows edits
- **WHEN** the user moves, rotates or hides a cutout
- **THEN** its body moves, rotates or disappears with it

#### Scenario: Imported part as it is
- **WHEN** a cutout is an imported STL, in either cutting mode
- **THEN** the translucent body is the part's own mesh, unchanged (also when the mesh is not a valid solid)

#### Scenario: Not exported
- **WHEN** the model is exported
- **THEN** the file contains the bin only and no tool body

#### Scenario: Toggle
- **WHEN** the user switches the tool overlay off
- **THEN** the bodies are hidden and the choice is remembered
