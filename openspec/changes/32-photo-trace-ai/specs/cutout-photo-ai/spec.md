# Spec Delta

## Purpose
Defines the optional neural silhouette engine for photo cutouts and the guarantee that the classic detection stays as the unchanged baseline.

## ADDED Requirements

### Requirement: Classic baseline unchanged
The classic silhouette detection described in `cutout-photo-trace` SHALL remain available, SHALL be the default engine, SHALL work without any download or network access, and SHALL produce exactly the same silhouettes as before this change for the same photo, corners, paper and settings.

#### Scenario: Default engine
- **WHEN** the photo dialog is opened and a photo is chosen
- **THEN** the classic engine is selected and no model is requested

#### Scenario: Unchanged result
- **WHEN** the two reference photos (with and without flash) are processed with the classic engine
- **THEN** each gives the same three silhouettes, with the same sizes and areas, as the recorded baseline

#### Scenario: Offline
- **WHEN** the device has no network and the classic engine is used
- **THEN** detection works as before

### Requirement: Engine choice
On the silhouette step the user SHALL be able to choose the detection engine, Classic or AI. The choice SHALL apply to the current photo and SHALL be kept while the dialog state lives (closing and reopening the dialog keeps it). Selection by click, the list with sizes, the sensitivity-independent steps (margin, depth, clearance) and the creation of cutouts SHALL work the same for both engines.

#### Scenario: Switching engines
- **WHEN** the user switches from Classic to AI and the model is ready
- **THEN** the silhouettes are recomputed by the AI engine and shown in the same view and list, numbered top to bottom

#### Scenario: Shared downstream
- **WHEN** silhouettes found by the AI engine are kept and Create is pressed
- **THEN** one cutout per kept silhouette is created exactly as for the classic engine, in true scale and position, with the bin footprint fitted

#### Scenario: Sensitivity
- **WHEN** the AI engine is active
- **THEN** the sensitivity control, which belongs to the classic detector, is not offered for it, and the margin still applies

### Requirement: Model manager
The app SHALL have a model manager window, reachable from the engine switch and from the footer, that lists the available models with their name, purpose, size, licence and status, and lets the user download, cancel, delete and choose the model used by the AI engine. Several models SHALL be downloadable and stored side by side. The models SHALL be kept in the browser's storage on the device; the window SHALL show the space they use and offer to delete all of them.

#### Scenario: List
- **WHEN** the manager is opened
- **THEN** every model is listed with its size, licence and status

#### Scenario: Download and delete
- **WHEN** the user downloads a model and later deletes it
- **THEN** progress is shown while downloading, the model is then ready for use, and after deleting its stored data is removed and it shows as not downloaded

#### Scenario: Choice
- **WHEN** two models are downloaded
- **THEN** the user picks which one the AI engine uses

#### Scenario: No model yet
- **WHEN** the user chooses the AI engine and no model is ready
- **THEN** the manager opens, and nothing is downloaded until the user starts a download

### Requirement: Model download and consent
A model SHALL be downloaded only after the user confirms. Before the first download of a model the app SHALL show its name, size, source host and licence, and the models offered SHALL be under permissive licences (MIT, Apache-2.0, BSD or CC0). Downloads SHALL show progress and be cancellable. If the download or the model fails, or the file's checksum does not match, the classic engine SHALL stay usable and the failure SHALL be shown.

#### Scenario: Consent first
- **WHEN** the user starts the first download of a model
- **THEN** a dialog states the size and that the source host sees the user's address, and nothing is downloaded until the user confirms

#### Scenario: Cached
- **WHEN** the model was downloaded earlier and the storage is intact
- **THEN** choosing it starts at once without a new download

#### Scenario: Failure
- **WHEN** the download is interrupted or the checksum of the file does not match
- **THEN** an error says so, the file is not used, and the app stays on the classic engine

#### Scenario: Storage unavailable
- **WHEN** the browser refuses persistent storage
- **THEN** the model works for the session and a notice says it will be downloaded again next time

### Requirement: Privacy
The photo, the straightened image and the masks SHALL be processed in the browser only and SHALL NOT be sent anywhere by the AI engine. The only network traffic added by the AI engine SHALL be the download of the model files, from a fixed, versioned location, after consent. The user interface and the References page SHALL say so, and SHALL list every model with its licence and source. Only models under permissive licences (MIT, Apache-2.0, BSD or CC0) SHALL be offered.

#### Scenario: No image upload
- **WHEN** a photo is processed by the AI engine
- **THEN** no network request carries image data

#### Scenario: Licence list
- **WHEN** the References page is opened
- **THEN** each model used by the app is listed with its licence and source

### Requirement: Silhouettes from the network
The AI engine SHALL run the straightened sheet through the model, turn its foreground mask into silhouettes with the same cleanup as the classic path (enclosed gaps filled, small specks and tiny silhouettes dropped, a margin along the paper edge ignored, one silhouette per separate object), and SHALL return them in the same form as the classic engine. Soft shadows beside a tool SHALL NOT be part of its silhouette.

#### Scenario: Reference photos
- **WHEN** each of the two reference photos is processed by the AI engine
- **THEN** three silhouettes are found, and each tool's width and height are within 1 mm of the baseline's

#### Scenario: Shadow
- **WHEN** a tool casts a soft shadow beside it
- **THEN** the silhouette follows the tool and not its shadow

#### Scenario: Margin
- **WHEN** the margin is 3 mm
- **THEN** nothing within 3 mm of the paper edge is a silhouette

#### Scenario: No objects
- **WHEN** the model finds nothing
- **THEN** the message for no silhouettes is shown and Create is disabled

### Requirement: Mask tuning
With the AI engine the user SHALL be able to tune how the network's soft mask becomes a silhouette: a threshold (where inside the soft edge the outline is drawn, moving it outward or inward) and a smoothing radius in mm (how much the soft mask is blurred before the threshold, which evens out a jagged or wavy outline). Changing either SHALL update the silhouettes without running the network again, and the effect on each silhouette's size in mm SHALL be visible. Both controls SHALL be shown to the user on the silhouette step whenever the AI engine is active, with plain-language labels and a short hint each (the threshold as how far the outline reaches into the blurry edge of the object, the smoothing as how evenly the outline runs), not as technical names. Each model SHALL have its own default threshold and smoothing, since models differ in how sharp their mask is, and a reset SHALL restore the defaults of the model in use. Changing the model SHALL load that model's defaults unless the user has changed the controls for this photo. The soft mask SHALL be viewable as a greyscale image next to the silhouettes.

#### Scenario: Live update
- **WHEN** the user moves the threshold or the smoothing slider
- **THEN** the silhouettes and their sizes update at once and the network is not run again

#### Scenario: Threshold direction
- **WHEN** the threshold is lowered
- **THEN** the outlines grow outward into the soft edge, and when it is raised they shrink

#### Scenario: Smoother outline
- **WHEN** the smoothing radius is raised
- **THEN** a wavy or jagged outline becomes smoother and the outline length shown does not grow

#### Scenario: Thin parts
- **WHEN** the smoothing radius is large enough to erase a thin part of a tool
- **THEN** the size change is visible in the list and a hint says that a smaller radius keeps thin parts

#### Scenario: Reset
- **WHEN** the user resets the mask settings
- **THEN** threshold and smoothing return to the defaults of the model in use

#### Scenario: Per-model defaults
- **WHEN** the user switches from one model to another without touching the controls
- **THEN** the controls show the new model's defaults

#### Scenario: Visible to the user
- **WHEN** the AI engine is active on the silhouette step
- **THEN** both controls are visible with their labels and hints, in the interface language

### Requirement: Accurate edge
The AI engine SHALL place the silhouette edge by the paper-colour test within a narrow band around the network's mask and SHALL use the network's own edge only where that test does not separate the object from the paper. The sizes it reports SHALL stay within 0.5 mm of the classic result wherever the classic result is accurate.

#### Scenario: Edge from the colour test
- **WHEN** a tool contrasts with the paper
- **THEN** its silhouette edge follows the colour edge, not the coarser edge of the network's mask

#### Scenario: Dark part in shadow
- **WHEN** a dark part of a tool merges with its own shadow so that the colour test cannot find its edge
- **THEN** the network's edge is used along that stretch and the silhouette is still one piece

#### Scenario: True scale
- **WHEN** a 40 × 20 mm rectangle lies on the paper and the corners are placed correctly
- **THEN** the AI silhouette measures 40 × 20 mm within 0.5 mm

### Requirement: Compare engines
The user SHALL be able to compare the two engines on the straightened view: the silhouettes of the inactive engine are drawn as outlines over the view, and a table lists each tool's width and height for both engines and the difference.

#### Scenario: Outlines
- **WHEN** compare is switched on
- **THEN** the outlines of the other engine appear as dashed lines over the straightened sheet

#### Scenario: Sizes
- **WHEN** compare is on
- **THEN** each silhouette's size is shown for both engines with the difference in mm

#### Scenario: Off by default
- **WHEN** the dialog is opened
- **THEN** compare is off and costs nothing

### Requirement: Language
All text of the AI engine, the model dialog and the compare view SHALL be available in every language of the app.

#### Scenario: Russian
- **WHEN** the interface language is Russian
- **THEN** the engine switch, the consent dialog, progress, errors and the compare table are in Russian
