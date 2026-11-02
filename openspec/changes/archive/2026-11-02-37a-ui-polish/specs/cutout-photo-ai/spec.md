# Spec Delta

## MODIFIED Requirements

### Requirement: Model manager
The app SHALL have a model manager, a modal window opened by a button with an AI icon in the top bar of the app, available on every page and independent of any mode. In the top bar, the unit and language switches and the action buttons (`AI models`, `GitHub`) SHALL share the same height. The model manager SHALL list the available models in sections by their kind (silhouette mask, depth) with their name, purpose, size, licence and status, and SHALL let the user download, cancel, delete and choose the model used for each kind. Several models SHALL be downloadable and stored side by side. The models SHALL be kept in the browser's storage on the device; the window SHALL show the space they use in the footer, SHALL link to the app's activity log for the details of downloads and runs, and SHALL offer a "Delete all" button in the top-right header of the model list (inside the dialog body, not in the bottom-right footer corner). Destructive delete buttons (per-model "Delete", "Delete all" and its confirmation action) SHALL be styled in the error/danger red colour.

#### Scenario: Always reachable
- **WHEN** the user is on any page of the app
- **THEN** the top bar has a button with an AI icon that opens the model manager, also when no AI feature is in use, and the unit switch, language switch and header action buttons have the same height

#### Scenario: Sections by kind
- **WHEN** the manager is opened
- **THEN** the models of each kind are in their own section, each with its size, licence and status

#### Scenario: Download and delete
- **WHEN** the user downloads a model and later deletes it
- **THEN** progress is shown while downloading, the model is then ready for use with a red Delete button, and after deleting its stored data is removed and it shows as not downloaded

#### Scenario: Delete all in the list header
- **WHEN** the manager is opened
- **THEN** the red "Delete all" button is placed at the top-right of the model list inside the dialog body (not in the bottom-right footer), and confirming deletes all downloaded models

#### Scenario: Choice
- **WHEN** two models of one kind are downloaded
- **THEN** the user picks which one the AI engine uses for that kind

#### Scenario: Activity indicator
- **WHEN** a download or an AI run is in progress and the manager is closed
- **THEN** the manager's button in the top bar shows that something is going on
