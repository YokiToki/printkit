# app-shell Specification

## Purpose
Defines the application layout, mode navigation and shared UI controls that every generator mode builds on.

## Requirements

### Requirement: Mode navigation
Inside Gridfinity Master the app SHALL offer three modes — Box, Baseplate and Cutout — selectable from the top bar, each reachable by its own URL path under `/gridfinity`.

#### Scenario: Switch mode
- **WHEN** the user selects Baseplate in the mode switcher
- **THEN** the URL path changes to the Gridfinity baseplate route and the baseplate parameter panel is shown

#### Scenario: Direct link
- **WHEN** the user opens the Gridfinity baseplate URL directly
- **THEN** the baseplate mode is shown without first visiting another mode

#### Scenario: Unavailable mode
- **WHEN** a mode or product has no implementation yet
- **THEN** a localized placeholder is shown in place of its parameter panel and the 3D viewport stays usable

### Requirement: Start page
The app SHALL open on a start page at the root path that lets the user choose Gridfinity Master, Keychain Master or Rack Master, each as a card with an icon, a short localized description and a link. Gridfinity Master SHALL have its own start page at `/gridfinity` where the user chooses Box, Baseplate or Cutout, and Rack Master SHALL have its own start page at `/rack` where the user chooses among its modes.

#### Scenario: Choose a product
- **WHEN** the user opens the root URL and selects the Keychain Master card
- **THEN** the keychain route opens and the product switcher shows Keychain Master as active

#### Scenario: Choose Rack
- **WHEN** the user opens the root URL and selects the Rack Master card, or presses 3
- **THEN** the `/rack` start page opens, and choosing Panel opens the panel mode with the product switcher showing Rack Master

#### Scenario: Choose a mode
- **WHEN** the user opens `/gridfinity` and selects the Cutout card
- **THEN** the cutout route opens and the mode switcher in the top bar shows Cutout as active

#### Scenario: Return to start
- **WHEN** the user selects the logo in the top bar from any section
- **THEN** the root start page is shown and every section's parameters stay stored

#### Scenario: Continue where you left off
- **WHEN** the user last worked in a keychain and opens the root page
- **THEN** a "Continue" link to Keychain Master is shown with the saved time

#### Scenario: Start page has no viewport
- **WHEN** a start page is shown
- **THEN** no 3D viewport or parameter panel is rendered and no geometry is computed

#### Scenario: Unknown path
- **WHEN** the user opens a path that matches no route
- **THEN** the root start page is shown

### Requirement: Per-mode persisted state
The app SHALL keep each mode's parameters independently and restore them after a page reload.

#### Scenario: Restore on reload
- **WHEN** the user changes baseplate parameters and reloads the page
- **THEN** the baseplate parameters have the same values as before the reload

#### Scenario: Corrupt storage
- **WHEN** persisted state cannot be parsed
- **THEN** the mode falls back to its default parameters and the app remains usable

### Requirement: Shared parameter controls
Parameter panels SHALL be composed from shared controls: numeric field with unit label, segmented choice, on/off toggle and collapsible section. Control labels SHALL never be clipped in English or Russian at the 380 px panel width. Every collapsible section SHALL be collapsed when its panel is first shown, whatever the stored parameters are. A section SHALL show a summary of its settings opposite its title; when those settings differ from their defaults the summary SHALL be highlighted in an orange accent colour taken from the theme, otherwise it SHALL use the muted text colour. A section whose summary is not a setting (a file name, a list of items) SHALL never be highlighted.

#### Scenario: Numeric clamping
- **WHEN** the user enters a value outside a control's allowed range
- **THEN** the value is clamped to the nearest bound and the control shows the clamped value

#### Scenario: Keyboard use
- **WHEN** the user tabs through a panel
- **THEN** every control is reachable and operable from the keyboard

#### Scenario: Long labels
- **WHEN** a segmented control has labels that do not fit on one line, such as the Russian "В каждой ячейке"
- **THEN** the full label is still readable, by wrapping inside its segment or by using a shorter label

#### Scenario: Collapsed by default
- **WHEN** a mode is opened, including with stored parameters that turn on a split, connectors or the build plate
- **THEN** all sections of its panel are collapsed, each with its summary visible

#### Scenario: Changed value is highlighted
- **WHEN** the user changes a setting of a collapsed section away from its default
- **THEN** the summary of that section is shown in the orange accent colour

#### Scenario: Default value is not highlighted
- **WHEN** the user sets the settings of a section back to the defaults, by hand or with Reset
- **THEN** the summary returns to the muted colour

#### Scenario: Highlight does not depend on units
- **WHEN** the user switches between mm and inches
- **THEN** no section changes its highlighted state

#### Scenario: Highlight is not only colour
- **WHEN** a section is highlighted
- **THEN** the section's accessible name also states that its settings were changed, so the state is not conveyed by colour alone

### Requirement: Product sections
The app SHALL be organised into product sections, Gridfinity Master, Keychain Master and Rack Master, each with its own routes, localized name and description, and its own persisted state. Language and display units SHALL be shared by all sections.

#### Scenario: Switch product
- **WHEN** the user selects Keychain Master in the product switcher
- **THEN** the keychain route opens, the top bar shows Keychain Master as the active product and the Gridfinity mode switcher is hidden

#### Scenario: Products do not share parameters
- **WHEN** the user changes baseplate parameters, opens Keychain Master and returns
- **THEN** the baseplate parameters are unchanged

#### Scenario: Global settings
- **WHEN** the user switches the language or mm/in in one section
- **THEN** the other section uses the same language and unit

#### Scenario: Legacy links
- **WHEN** the user opens `#/baseplate`, `#/box` or `#/cutout`
- **THEN** the app shows the matching `/gridfinity/...` route

### Requirement: Start page illustrations
Each mode card on the Gridfinity and Keychain start pages and each product card on the root start page SHALL show an isometric illustration that is a render of an actual model produced by the app (a small part with default settings), not a schematic drawing or an icon. The Gridfinity product card SHALL show the box; the Keychain product card SHALL show an image-mode keychain; the Keychain Image and Shape cards SHALL each show a render of their own mode. The image-mode keychain illustration SHALL show a shape with a complex organic outline (a paw print), not a circle or other plain geometric figure. Illustrations SHALL be static vector images, SHALL follow the app's colour tokens, and SHALL NOT require WebGL, geometry computation or network requests on the start page.

#### Scenario: Renders match the editor
- **WHEN** the Baseplate card is shown
- **THEN** its illustration is a 2×2 baseplate with the standard cell pockets and the default corner fastener holes, as the editor produces by default

#### Scenario: Product cards
- **WHEN** the root start page is shown
- **THEN** the Gridfinity card shows the box illustration and the Keychain card shows the image-mode keychain illustration

#### Scenario: Keychain mode cards
- **WHEN** the Keychain start page is shown
- **THEN** the Image card shows a relief keychain in the shape of a paw print with a ring eyelet and the Shape card shows a keychain with a geometric outline and rim, each a render of what that mode produces

#### Scenario: Smooth outline
- **WHEN** the Keychain Image illustration is viewed at 200 % zoom or on a high-density display
- **THEN** its outer outline and the edges between shaded areas are smooth curves, with no visible pixel stairs

#### Scenario: Cards stay level
- **WHEN** the root start page is shown
- **THEN** the drawn height of the Keychain illustration equals that of the Gridfinity box illustration

#### Scenario: No runtime geometry
- **WHEN** the start page is opened
- **THEN** no worker is started, no WASM is loaded and no WebGL context is created

#### Scenario: Theme tokens
- **WHEN** a colour token of the theme changes
- **THEN** the illustrations change colour with it without regenerating the image files

#### Scenario: Crisp on any display
- **WHEN** the page is shown on a high-density display or zoomed to 200 %
- **THEN** illustration edges stay sharp

#### Scenario: Decorative
- **WHEN** a screen reader reads a card
- **THEN** the illustration is skipped and the card is announced by its title and description

#### Scenario: Weight
- **WHEN** the production build is made
- **THEN** each illustration is at most 60 KB uncompressed

### Requirement: Keychain modes and routes
Keychain Master SHALL be organised into modes like Gridfinity Master: a mode chooser at its root path, one route per mode, and the product's mode switcher in the top bar. Unknown paths under the product SHALL return to its chooser.

#### Scenario: Routes
- **WHEN** the user opens the Keychain Master path
- **THEN** the mode chooser is shown, and the Image and Shape modes open at their own paths

#### Scenario: Mode switcher
- **WHEN** a Keychain Master mode is open
- **THEN** the top bar shows the product switcher and a mode switcher with Image and Shape, and the Gridfinity modes are not shown

#### Scenario: Unknown path
- **WHEN** the user opens an unknown path under Keychain Master
- **THEN** the Keychain Master mode chooser is shown

### Requirement: Start over
Every mode panel (box, baseplate, cutout, keychain image, keychain shape) SHALL have a "Start over" button, reachable while all sections are collapsed. Activating it SHALL ask for confirmation and, once confirmed, return all parameters of that mode to their defaults. It SHALL NOT change the parameters of other modes, the language, the display units or the export settings.

#### Scenario: Confirmed
- **WHEN** the user changes several settings in the baseplate mode, presses Start over and confirms
- **THEN** all baseplate parameters equal their defaults, no section is highlighted and the model is rebuilt with defaults

#### Scenario: Cancelled
- **WHEN** the user presses Start over and cancels, or presses Esc
- **THEN** no parameter changes and focus returns to the button

#### Scenario: Other state kept
- **WHEN** the user starts over in the box mode
- **THEN** baseplate and cutout parameters, language, units and export settings are unchanged

#### Scenario: Imported files
- **WHEN** the user starts over in the cutout or keychain image mode with an imported file
- **THEN** the file is no longer used by the model and the mode shows its empty state

#### Scenario: Persisted
- **WHEN** the user starts over and reloads the page
- **THEN** the mode opens with its default parameters

### Requirement: Beta notice
The site SHALL show a "beta" label next to the site name and SHALL give a disclaimer that the functionality is not fully tested: dimensions, fit and print settings may be wrong, the user should check the model and test-print a small part, and there is no warranty. The disclaimer SHALL be reachable from the label and repeated in the footer, in every language of the site.

#### Scenario: Label
- **WHEN** any page of the site is shown
- **THEN** the top bar shows the beta label next to the site name

#### Scenario: Disclaimer from the label
- **WHEN** the user selects the label
- **THEN** the disclaimer text is shown and can be dismissed with Escape or by selecting outside it

#### Scenario: Footer
- **WHEN** a start page is shown
- **THEN** its footer repeats the disclaimer

#### Scenario: Language
- **WHEN** the interface language is Russian
- **THEN** the label and the disclaimer are in Russian

### Requirement: Version
The site SHALL show its version in semantic versioning form (`MAJOR.MINOR.PATCH`), read from the project's single version number, in the footer and in the beta notice. The current release is 1.0.0. The version SHALL be raised for every change to the site: the minor number for a new feature, the patch number for a fix or rework, the major number for an incompatible change.

#### Scenario: Shown
- **WHEN** a start page or the beta notice is shown
- **THEN** it shows the version as `v` followed by the number, for example `v1.0.0`

#### Scenario: One source
- **WHEN** the version is changed in `package.json` and the site is built
- **THEN** the footer and the beta notice show the new number without any other edit

#### Scenario: Release
- **WHEN** this change is released
- **THEN** the version is 1.0.0
