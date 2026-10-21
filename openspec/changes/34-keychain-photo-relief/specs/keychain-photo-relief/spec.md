# Spec Delta

## Purpose
Defines how a photo becomes a recognisable portrait relief on a keychain by mixing three sources of form, the contour, the depth and the detail of the photo, with a crop and an optional whole-frame plaque.

## ADDED Requirements

### Requirement: Photo relief source
In Image mode the user SHALL be able to choose Photo as the relief height source, next to Distance and Brightness. The Photo source SHALL build the height inside the silhouette from three sources of form, each with a share the user sets: Contour (the distance from the silhouette edge, as in the Distance source), Depth (the depth of the photo computed by a model) and Detail (the local contrast of the photo's brightness). The shares SHALL be treated as proportions, so that the relief always uses the full height range. A share of zero SHALL switch that source off, and Contour alone SHALL equal the Distance source.

#### Scenario: Mix
- **WHEN** the shares are Contour 30, Depth 40 and Detail 30
- **THEN** the relief shows the keychain's edge roll-off, the overall form of the subject and the fine structure together

#### Scenario: Contour only
- **WHEN** Depth and Detail are zero
- **THEN** the relief is the same as with the Distance source

#### Scenario: Unavailable source
- **WHEN** no depth has been computed and the Depth share is above zero
- **THEN** the relief is built from the other sources, and the panel says that depth is missing

#### Scenario: Proportions
- **WHEN** all shares are doubled
- **THEN** the relief is unchanged

#### Scenario: Live
- **WHEN** a share changes
- **THEN** the preview and the relief update without running any model

### Requirement: Depth source
The depth of the photo SHALL be computed once from the image, or from its crop, by a model of the depth kind chosen in the model manager and run in the browser, and kept with the image. Parts of the subject nearer to the camera SHALL be higher than parts farther from it. The depth range used SHALL be taken from the pixels inside the silhouette, so a far background does not use up the height range. The image and the result SHALL stay in the browser. If no depth model is ready, the model manager SHALL open and nothing SHALL be downloaded without the user's confirmation.

#### Scenario: Form
- **WHEN** the depth of a photo of an animal is computed and the Depth share is raised
- **THEN** the head and the front of the muzzle are higher than the surroundings of the face, inside the silhouette

#### Scenario: Range inside the subject
- **WHEN** the background is far away and the subject is shallow
- **THEN** the subject's relief still spans the configured height range

#### Scenario: No model
- **WHEN** the user presses Compute depth and no depth model is downloaded
- **THEN** the model manager opens and the run starts only after a model is downloaded and chosen

#### Scenario: Crop
- **WHEN** the crop has changed since the depth was computed
- **THEN** the depth stays in use and is marked as computed for another crop, and the user can recompute it for the current crop

#### Scenario: No upload
- **WHEN** the depth is computed
- **THEN** no network request carries image data

### Requirement: Detail
The Detail source SHALL even out the lighting of the photo locally, so that fine structure such as eyes, a nose and stripes becomes visible as relief even in a flat-lit photo. Its radius SHALL be set as a length in mm of the finished part, so the same value gives the same result at any image resolution and size. Detail SHALL add structure around the form and SHALL NOT raise or lower the part as a whole because a photo is brighter or darker. The user SHALL be able to reduce the detail to a chosen number of levels (2 to 8), with a softness from hard steps to smooth ramps; zero levels SHALL mean continuous tones. Detail at zero amount SHALL add no structure.

#### Scenario: Face detail
- **WHEN** the Detail share is raised on a face crop
- **THEN** the eyes, the nose and the stripes appear as relief around the face form

#### Scenario: Radius in mm
- **WHEN** the same photo is used at two resolutions with the same radius in mm
- **THEN** the detail appears at the same scale on the part

#### Scenario: Brightness
- **WHEN** a photo is uniformly brighter or darker
- **THEN** the height of the part does not change because of it

#### Scenario: Four levels
- **WHEN** the levels are set to 4
- **THEN** the detail uses four distinct heights, and the face stays recognisable

#### Scenario: Softness
- **WHEN** the softness is raised
- **THEN** the steps between levels become gradual slopes

### Requirement: Crop
In Image mode the user SHALL be able to crop the image to a rectangle by dragging it over the image, with handles on the corners and edges, an aspect ratio lock, a button that fits the crop to the subject when an AI mask exists, and a reset. The crop SHALL be non-destructive (the image stays whole) and SHALL apply to the silhouette, the relief, the preview and everything built from them. Changing the crop SHALL NOT run a matte model again.

#### Scenario: Crop to a face
- **WHEN** the user drags the crop over the face in a photo
- **THEN** the mask preview and the relief show only that region, with the face filling the keychain

#### Scenario: Non-destructive
- **WHEN** the crop is changed or reset
- **THEN** the original image is unchanged and resetting restores the full frame

#### Scenario: Fit to subject
- **WHEN** an AI mask exists and the user presses Fit to subject
- **THEN** the crop becomes the mask's bounding box with a small margin

#### Scenario: Aspect lock
- **WHEN** an aspect ratio is locked and a handle is dragged
- **THEN** the crop keeps that ratio

#### Scenario: No model run
- **WHEN** the crop changes and the silhouette comes from an AI mask
- **THEN** the mask is cropped without running the model again

### Requirement: Whole frame silhouette
The user SHALL be able to choose Whole frame as the silhouette source, which makes the whole cropped image the material, so the keychain is a plaque whose shape comes from the base plate options. Controls that only matter for a traced silhouette (threshold, close gap, fill areas, specks) SHALL NOT be shown for it.

#### Scenario: Plaque
- **WHEN** Whole frame is chosen with a rounded rectangle plate
- **THEN** the keychain is a rounded rectangular plaque carrying the photo relief

#### Scenario: Edge
- **WHEN** the relief reaches the plaque's edge
- **THEN** it rolls off to the rim height and does not end as a vertical wall

### Requirement: Detail as engraving
The Detail source SHALL offer three modes: Engrave (the darkest features of the photo are pressed in as grooves and the mid-tones stay smooth), Relief (the tone drives the height) and Both. Engrave SHALL be the default. The user SHALL be able to set how dark a feature must be to be engraved.

#### Scenario: Engrave
- **WHEN** the mode is Engrave on a face crop
- **THEN** the eyes, the nose and the dark stripes are grooves and the rest of the surface is not bumpy

#### Scenario: Threshold
- **WHEN** the dark threshold is lowered
- **THEN** more of the photo's darker features are engraved

#### Scenario: Relief
- **WHEN** the mode is Relief
- **THEN** the height follows the tone as before

### Requirement: Photo presets
The app SHALL offer presets for the Photo source (Subtle, Portrait, Deep) that set the three shares, the height range, and the detail radius, amount and levels. Each value SHALL stay editable and the panel SHALL then show Custom.

#### Scenario: Portrait
- **WHEN** the user chooses Portrait
- **THEN** the shares, range and detail values are set to the preset's values

#### Scenario: Edited
- **WHEN** the user edits any of them afterwards
- **THEN** the preset indicator shows Custom and the value is kept

### Requirement: Persistence of the depth result
The depth SHALL be stored with the image in the browser's storage and restored after a reload with the source and controls, without running the model again. Deleting the model from the model manager SHALL NOT remove an existing result; replacing or removing the image SHALL. If the stored result is missing, the app SHALL say so, offer to run again and build the relief without the Depth share meanwhile, never an empty relief. If storage is unavailable the result SHALL work for the session and the user SHALL be warned that it will not persist.

#### Scenario: Reload
- **WHEN** the user computes the depth, sets the shares and reloads
- **THEN** the same relief is shown without running the model

#### Scenario: Result lost
- **WHEN** the stored depth is gone but the Depth share is above zero
- **THEN** a message offers to run again and the relief uses the other sources until then

### Requirement: Availability and hints
The Photo source SHALL be offered only in Image mode and SHALL NOT be offered for SVG images. The app SHALL tell the user when the detail asked for is finer than the grid can carry (a finer quality setting is needed) and when the subject's face is too small in the part to read (crop closer or use Whole frame). Hints SHALL never block an action.

#### Scenario: Shape mode
- **WHEN** the mode is Shape
- **THEN** the Photo source is not offered

#### Scenario: Coarse grid
- **WHEN** the grid cell is larger than about a third of the detail radius
- **THEN** a hint suggests a finer quality

#### Scenario: Small face
- **WHEN** the detail radius is only a few grid cells at the current crop
- **THEN** a hint suggests cropping closer or using Whole frame

### Requirement: Smooth outline
The outline of a keychain made from an image SHALL be smooth: it SHALL NOT show steps from the pixels of the image, from the cells of the relief grid or from the resolution of the mask, and its position SHALL follow the edge of the subject to a fraction of a grid cell. Sharp corners that exist in the subject, such as the tip of a thin spike, SHALL stay sharp while the curves between them are smoothed. The user SHALL be able to set the smoothness and the angle from which a vertex counts as a corner.

#### Scenario: No steps
- **WHEN** the silhouette of a photo or a drawing is made into a keychain at any quality setting
- **THEN** the side wall follows a smooth line and shows no staircase

#### Scenario: Spike tips
- **WHEN** the drawing has a thin pointed spike
- **THEN** the spike keeps its tip and its length within the grid cell

#### Scenario: Independent of the grid
- **WHEN** the quality setting is made coarser
- **THEN** the outline stays smooth and only the relief detail becomes coarser

### Requirement: Compatibility
Keychains saved before this feature SHALL load unchanged. With the Distance or Brightness source, no crop and a traced silhouette, the relief SHALL be identical to what it was before this feature.

#### Scenario: Old record
- **WHEN** a record without the new fields is loaded
- **THEN** it opens with its former source, the full frame, and produces the same relief as before

### Requirement: Language
All text of the Photo source, the crop, the whole-frame silhouette, the presets and the hints SHALL be available in every language of the app.

#### Scenario: Russian
- **WHEN** the interface language is Russian
- **THEN** the source choice, shares, crop controls, presets and hints are in Russian
