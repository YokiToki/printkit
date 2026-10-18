# Spec Delta

## Purpose
Defines a relief height source derived from the depth of a photo, so that the inside of a photographed subject, such as a face, shows as form on the keychain and not only as an outline.

## ADDED Requirements

### Requirement: Photo depth source
In Image mode the user SHALL be able to choose Photo depth as the relief height source, next to Distance and Brightness. The depth SHALL be computed once from the image by a model chosen in the model manager, run in the browser, and kept with the image. With this source, parts of the subject nearer to the camera SHALL be higher than parts farther from it, inside the silhouette, and the existing contrast, gamma, invert and smoothing controls SHALL apply to it. The image and the result SHALL stay in the browser. If no model is ready, the model manager SHALL open and nothing SHALL be downloaded without the user's confirmation.

#### Scenario: Face form
- **WHEN** the depth of a photo of an animal's face is computed and Photo depth is the source
- **THEN** the nose and the front of the muzzle are higher than the cheeks and the surroundings of the face, inside the silhouette

#### Scenario: Invert
- **WHEN** the user turns Invert on
- **THEN** the nearer parts become the lower ones

#### Scenario: No model
- **WHEN** the user presses Compute depth and no depth model is downloaded
- **THEN** the model manager opens and the run starts only after a model is downloaded and chosen

#### Scenario: Live controls
- **WHEN** the user changes contrast, gamma, smoothing or the mix
- **THEN** the relief updates without running the model again

#### Scenario: No upload
- **WHEN** the depth is computed
- **THEN** no network request carries image data

### Requirement: Use of the silhouette
The depth relief SHALL be limited to the silhouette. The depth range used for the height SHALL be taken from the pixels inside the silhouette, so that the background does not use up the height range, and the edge of the silhouette SHALL roll off with the relief's rim as for the other sources.

#### Scenario: Range inside the subject
- **WHEN** the background is far away and the subject is shallow
- **THEN** the subject's relief spans the configured height range and does not stay almost flat

#### Scenario: Edge
- **WHEN** the silhouette edge lies on a nearer part of the subject
- **THEN** the edge still rolls off to the rim height and does not stand as a vertical cliff

### Requirement: Mix with brightness
The user SHALL be able to mix the depth with the brightness detail of the photo with a slider from depth only to detail only, so that fine structure that depth smooths out can be added. The brightness part SHALL add relief around the depth form and SHALL NOT raise the whole image by its mean brightness.

#### Scenario: Depth only
- **WHEN** the mix is at depth only
- **THEN** the relief follows the depth alone

#### Scenario: Detail added
- **WHEN** the mix is raised
- **THEN** local structure such as an eye outline or whisker lines appears on top of the depth form

#### Scenario: Mean brightness
- **WHEN** a photo is uniformly brighter or darker
- **THEN** the relief form does not rise or sink as a whole because of it

### Requirement: Detail boost
The brightness source and the mix SHALL offer a detail boost that evens out the lighting (local contrast), so that a flat-lit photo can use the available height range. Boost at zero SHALL leave the brightness source unchanged.

#### Scenario: Flat photo
- **WHEN** a photo has a narrow tonal range inside the subject and the boost is raised
- **THEN** the relief shows more local structure

#### Scenario: Off
- **WHEN** the boost is zero
- **THEN** the Brightness source gives the same relief as before this feature

### Requirement: Relief depth presets
The app SHALL offer presets for the height range of a photo relief (Subtle, Portrait, Deep) that set the range and rim roll-off. Each value SHALL stay editable and the panel SHALL then show Custom.

#### Scenario: Preset
- **WHEN** the user chooses Portrait
- **THEN** the range and rim values are set to the preset's values

#### Scenario: Edited
- **WHEN** the user edits the range after choosing a preset
- **THEN** the preset indicator shows Custom and the value is kept

### Requirement: Persistence of the depth result
The depth SHALL be stored with the image in the browser's storage and restored after a reload with the source and controls, without running the model again. Deleting the model from the model manager SHALL NOT remove an existing result; replacing or removing the image SHALL. If the stored result is missing, the app SHALL say so, offer to run again and use the Distance source meanwhile, never an empty relief. If storage is unavailable the result SHALL work for the session and the user SHALL be warned that it will not persist.

#### Scenario: Reload
- **WHEN** the user computes the depth, sets the mix and reloads
- **THEN** the same relief is shown without running the model

#### Scenario: Result lost
- **WHEN** the stored depth is gone but Photo depth is selected
- **THEN** a message offers to run again and the relief follows Distance until then

### Requirement: Availability and hints
Photo depth SHALL be offered only in Image mode and SHALL be unavailable for SVG images and when the image has no silhouette mask to limit it. When the grid is too coarse for facial detail, the app SHALL say that a finer quality setting is needed. Hints SHALL never block an action.

#### Scenario: Shape mode
- **WHEN** the mode is Shape
- **THEN** Photo depth is not offered

#### Scenario: Coarse grid
- **WHEN** the quality setting is too coarse for the detail of the depth relief
- **THEN** a hint suggests a finer quality

### Requirement: Compatibility
Keychains saved before this feature SHALL load unchanged. With the Distance or Brightness source and the boost at zero, the relief SHALL be identical to what it was before this feature.

#### Scenario: Old record
- **WHEN** a record without the new fields is loaded
- **THEN** it opens with its former source and produces the same relief as before

### Requirement: Language
All text of the photo relief, its controls, presets and hints SHALL be available in every language of the app.

#### Scenario: Russian
- **WHEN** the interface language is Russian
- **THEN** the source choice, button, mix, boost, presets, hints and warnings are in Russian
