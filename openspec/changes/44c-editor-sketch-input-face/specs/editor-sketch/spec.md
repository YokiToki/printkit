# Spec Delta

## Purpose
Specifies universal typed HUD input for all sketch tools and direct face selection when creating sketches.

## MODIFIED Requirements

### Requirement: Drawing tools
The sketch mode SHALL provide Line (polyline), Rectangle (two corners or centre, with an optional corner radius), Circle (centre and radius/diameter), Arc (three points, or centre-start-end), Slot and regular Polygon, each accepting typed values for the main dimensions and coordinates while drawing via a floating HUD.

#### Scenario: Rounded rectangle
- **WHEN** the user draws a rectangle with corner radius 5 mm
- **THEN** four lines and four tangent arcs are created, the radii are tied by an equal constraint, and one radius dimension of 5 mm drives all four

#### Scenario: Typed values
- **WHEN** the user starts a circle and types 12 and Enter
- **THEN** the circle has radius 12 mm and a radius dimension

#### Scenario: Slot
- **WHEN** the user draws a slot of length 30 and width 8
- **THEN** two lines and two arcs are created, tangent to each other, with the width as a dimension

#### Scenario: Circle typed values
- **WHEN** drawing a circle and the user types X=10, Tab, Y=20, Enter, then types diameter 15 and Enter
- **THEN** a circle centered at (10, 20) with diameter 15 mm is created with driving constraints

#### Scenario: Direct face selection
- **WHEN** in Object mode the user triggers New Sketch and clicks a highlighted planar face of an object
- **THEN** a sketch is created aligned with that face and linked to the host object without manually switching to Face Selection mode
