# Spec Delta

## Purpose
Specifies visual Before/After audit reporting, interactive viewport comparison modes, and print bed alignment for mesh repairs.

## MODIFIED Requirements

### Requirement: Auto repair
The Editor SHALL provide Auto repair that runs the standard sequence, displays a comparative Before/After audit with delta badges for all geometry metrics, offers viewport comparison modes (Original, Repaired, Split-view), and provides 1-click bed placement (Drop to Bed, Center on Bed).

#### Scenario: Typical download
- **WHEN** Auto repair runs on a mesh with duplicate vertices, one hole and flipped normals
- **THEN** the result is a valid solid, the report lists the three fixes, and one undo restores the original

#### Scenario: Not repairable
- **WHEN** problems remain
- **THEN** the report lists them and offers Make Solid

#### Scenario: Before after audit badges
- **WHEN** repair completes
- **THEN** the report displays before and after values for triangles, vertices, holes, shells, and volume with positive or negative delta badges ($\pm\Delta$)

#### Scenario: Interactive compare view
- **WHEN** switching between Original, Repaired, and Split view modes
- **THEN** the viewport dynamically toggles display between the initial broken mesh and the repaired candidate solid

#### Scenario: Drop to bed action
- **WHEN** the user clicks Drop to Bed
- **THEN** the object translates vertically so its lowest vertex lies exactly on $Z = 0$
