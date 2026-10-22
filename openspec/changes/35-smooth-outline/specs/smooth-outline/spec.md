# Spec Delta

## Purpose
Defines the shared stage that turns a detected silhouette into a smooth outline with few points, used by Cutout with either detection engine and by Keychain.

## ADDED Requirements

### Requirement: Smooth outline from any silhouette
The outline made from a silhouette, whether found by the classic detection, by the AI engine or from a keychain image or shape, SHALL be smooth: it SHALL be fitted with smooth curves instead of following every pixel and every wobble of the detected edge, and SHALL be turned into a polygon with a small number of vertices. Sharp corners of the subject, such as the tip of a tool, SHALL stay sharp, and the curves between corners SHALL be continuous in direction. The user SHALL be able to set the smoothness and the fit tolerance and to choose to keep the original polyline.

#### Scenario: Smooth walls
- **WHEN** a pocket is made from a detected tool and viewed along its wall
- **THEN** the wall shows no ripple that follows the pixels or the noise of the detected edge

#### Scenario: Fewer points
- **WHEN** the outline of a tool is made with the default tolerance
- **THEN** its polygon has at least five times fewer vertices than the original polyline, and no point of it is farther than the tolerance from the original polyline

#### Scenario: Sharp tips
- **WHEN** a tool has a pointed tip
- **THEN** the tip stays pointed and its position is within the tolerance of the original

#### Scenario: Both engines
- **WHEN** the same photo is processed by the classic and the AI engine
- **THEN** both outlines go through the same stage and both come out smooth

#### Scenario: Original polyline
- **WHEN** the user chooses to keep the original polyline
- **THEN** the outline is the same as before this feature

### Requirement: Clearance on the smooth outline
The clearance of a cutout SHALL be applied to the smooth outline so that the pocket stays smooth: rounded at convex corners, mitred at concave ones, and never smaller than the outline plus the clearance.

#### Scenario: Convex corner
- **WHEN** the clearance is 0.8 mm and the outline has a convex tip
- **THEN** the pocket around the tip is rounded with a radius of the clearance

#### Scenario: Containment
- **WHEN** a pocket is made with a clearance
- **THEN** the tool's outline lies inside the pocket everywhere

### Requirement: Detection unchanged
Adding the smooth outline SHALL NOT change which silhouettes the classic detection finds, their sizes or their numbering; only the polygon made from each of them.

#### Scenario: Same silhouettes
- **WHEN** the reference photos are processed
- **THEN** the number, sizes and areas of the silhouettes are identical to those before this feature

### Requirement: Compatibility and language
Sessions saved before this feature SHALL load unchanged. All text of this feature SHALL be available in every language of the app.

#### Scenario: Old session
- **WHEN** a session with outline cutouts saved before this feature is loaded
- **THEN** the cutouts are as they were

#### Scenario: Russian
- **WHEN** the interface language is Russian
- **THEN** the smoothness, tolerance and polyline option are in Russian
