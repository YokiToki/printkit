# Spec Delta

## Purpose
Defines the AI silhouette source for Keychain Image mode: removing the background of a photo with a model that runs in the browser, tuning the result and keeping it across reloads.

## ADDED Requirements

### Requirement: Silhouette source
In Image mode the user SHALL be able to choose where the silhouette comes from: Brightness (the existing threshold, invert and alpha behaviour) or AI (background removal by a model). Brightness SHALL remain the default and SHALL behave exactly as before. Choosing a source SHALL NOT change the image, and switching back and forth SHALL need no new import.

#### Scenario: Default
- **WHEN** an image is imported
- **THEN** the source is Brightness and the silhouette and relief are the same as without this feature

#### Scenario: Switching
- **WHEN** the user switches from AI to Brightness and back
- **THEN** each source shows its own silhouette from the same image, and an already computed AI result is not computed again

#### Scenario: Controls of the source
- **WHEN** the source is AI
- **THEN** the brightness threshold and invert are not shown, and close gap, fill areas, remove specks and grow are still available

### Requirement: Remove background with AI
With the AI source the user SHALL be able to run background removal on the whole image with a model chosen from the model manager. The run SHALL show progress and be cancellable, SHALL work on any image aspect ratio without distorting it, and SHALL keep the original image. The image and the result SHALL stay in the browser. If no model is ready, the model manager SHALL open and nothing SHALL be downloaded without the user's confirmation.

#### Scenario: Run
- **WHEN** the user presses Remove background with a model ready
- **THEN** progress is shown, and on completion the silhouette preview and the relief show the subject without the background

#### Scenario: Any proportions
- **WHEN** the image is a wide landscape or a tall portrait
- **THEN** the subject's outline is not stretched compared with the image

#### Scenario: No model
- **WHEN** the user presses Remove background and no model is downloaded
- **THEN** the model manager opens, and the run starts only after a model is downloaded and chosen

#### Scenario: Cancel
- **WHEN** the user cancels a run or starts another
- **THEN** the cancelled run's result is discarded and does not replace the current silhouette

#### Scenario: No upload
- **WHEN** a run is made
- **THEN** no network request carries image data

### Requirement: Mask controls
With the AI source the user SHALL have the same two controls as for photo cutouts: edge reach (how far the outline reaches into the soft edge of the subject) and outline smoothness (a length in mm of the keychain). Changing either SHALL update the silhouette and the relief without running the model again. Each model SHALL have its own defaults, a reset SHALL restore them, and the soft result SHALL be viewable as a greyscale image.

#### Scenario: Live
- **WHEN** the user moves edge reach or smoothness
- **THEN** the mask preview and the relief update and the model is not run again

#### Scenario: Smoothness in mm
- **WHEN** the same keychain size and smoothness value are used on a small and a large image
- **THEN** the outline is smoothed by the same distance in mm on the part

#### Scenario: Model defaults
- **WHEN** another model is chosen and its result is computed
- **THEN** the controls show that model's defaults unless the user has changed them for this image

### Requirement: Keep the main object
With the AI source the user SHALL be able to keep only the largest connected object of the silhouette, on by default, so that stray fragments of the background are dropped. Enclosed gaps inside the kept object SHALL remain areas with their modes as before.

#### Scenario: Stray fragments
- **WHEN** the model leaves a small speck of background away from the subject and the option is on
- **THEN** the speck is not part of the silhouette

#### Scenario: Off
- **WHEN** the option is turned off
- **THEN** all objects the mask contains are kept

#### Scenario: Areas
- **WHEN** the kept object has an enclosed gap such as a ring handle
- **THEN** it appears in the area list with a numeric id and the usual modes

### Requirement: Persistence of the AI result
The AI result SHALL be stored with the image in the browser's storage and restored after a reload together with the source, model and controls, without running the model again. Deleting the model from the model manager SHALL NOT remove an existing result. Replacing or removing the image SHALL remove its result. If the stored result is missing, the app SHALL say so, offer to run again and use Brightness meanwhile, never an empty silhouette. If storage is unavailable the AI source SHALL work for the session and the user SHALL be warned that the result will not persist.

#### Scenario: Reload
- **WHEN** the user runs AI background removal, adjusts smoothness and reloads
- **THEN** the same silhouette is shown without running the model

#### Scenario: Model deleted
- **WHEN** the user deletes the used model in the model manager
- **THEN** the silhouette from the stored result remains

#### Scenario: Result lost
- **WHEN** the stored result is gone but the AI source is selected
- **THEN** a message offers to run again, and the silhouette follows Brightness until then

#### Scenario: Storage unavailable
- **WHEN** persistent storage cannot be used
- **THEN** the AI result works in memory and a warning is shown

### Requirement: Hints
The app SHALL tell the user when an image has its own transparency (it is used as is, AI can still be chosen) and when an image looks like a two-tone logo on a plain background (Brightness is usually quicker and sharper). SVG images SHALL NOT offer the AI source. Hints SHALL never block an action.

#### Scenario: Transparent image
- **WHEN** a PNG with transparency is imported
- **THEN** a note says its transparency is used and the AI source remains selectable

#### Scenario: Logo
- **WHEN** the image is a black logo on a white background
- **THEN** a hint suggests Brightness

#### Scenario: SVG
- **WHEN** the image is an SVG
- **THEN** the AI source is not offered

### Requirement: Compatibility
Keychains saved before this feature SHALL load with the Brightness source and unchanged settings, and with the Brightness source the relief SHALL be identical to what it was before this feature.

#### Scenario: Old record
- **WHEN** a record without the new fields is loaded
- **THEN** it opens with the Brightness source and produces the same relief as before

### Requirement: Language
All text of the AI silhouette source, its controls and hints SHALL be available in every language of the app.

#### Scenario: Russian
- **WHEN** the interface language is Russian
- **THEN** the source choice, button, controls, progress, hints and warnings are in Russian
