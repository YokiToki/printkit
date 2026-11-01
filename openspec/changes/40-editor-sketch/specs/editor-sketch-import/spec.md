# Spec Delta

## Purpose
Defines importing vector outlines from SVG into a sketch.

## ADDED Requirements

### Requirement: SVG import
The Editor SHALL import an SVG file into a sketch (a new one on a chosen plane or the open one), supporting paths, rectangles, circles, ellipses, lines, polylines, polygons and group transforms, and ignoring other content with a notice.

#### Scenario: Import a logo outline
- **WHEN** the user imports an SVG with a closed path and a circular hole
- **THEN** a sketch with the outline and the hole is created, with Y pointing up, and it can be extruded into a body with a hole

#### Scenario: Scale
- **WHEN** the user chooses "fit width to 60 mm"
- **THEN** the imported geometry is scaled proportionally to that width

#### Scenario: Curves
- **WHEN** the file has Bézier curves
- **THEN** they are flattened to a 0.02 mm tolerance and the number of segments is reported

#### Scenario: Unsupported content
- **WHEN** the file contains text, images or filters
- **THEN** they are skipped and the notice lists what was ignored

#### Scenario: Large or invalid file
- **WHEN** the file is over 5 MB, has more than 50 000 segments, or is not valid SVG
- **THEN** it is refused with a message and nothing is added

### Requirement: Imported geometry
Imported curves SHALL be ordinary sketch geometry without constraints, joined into shared points where endpoints coincide within 0.001 mm, and can be dimensioned, constrained, trimmed and extruded.

#### Scenario: Joined endpoints
- **WHEN** a path is closed by matching endpoints
- **THEN** the profile is detected as closed

#### Scenario: Log
- **WHEN** an import finishes
- **THEN** the file name, size and number of curves are logged, not its content
