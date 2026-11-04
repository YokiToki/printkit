# app-shell Spec Delta

## MODIFIED Requirements

### Requirement: Mode navigation
Inside any product (Gridfinity, Keychain, Rack) the app SHALL display breadcrumb navigation in the top bar reflecting the site hierarchy: `PrintKit / <Product> / <Mode>` (e.g. `PrintKit / Gridfinity / Box`), always in English regardless of the selected interface language. The first crumb (`PrintKit`) SHALL link to the root start page `/` on all pages. When navigating inside a mode, the product crumb SHALL link to that product's mode chooser page (e.g. `/gridfinity`). The top bar SHALL NOT show separate product switcher or mode switcher button groups, and SHALL NOT show separate buttons for AI models or agents.

#### Scenario: Switch mode
- **WHEN** the user selects a mode or product crumb in the breadcrumb trail
- **THEN** the URL path changes to the selected route and the corresponding view is shown

#### Scenario: Direct link
- **WHEN** the user opens the Gridfinity baseplate URL directly
- **THEN** the baseplate mode is shown without first visiting another mode

#### Scenario: Unavailable mode
- **WHEN** a mode or product has no implementation yet
- **THEN** a localized placeholder is shown in place of its parameter panel and the 3D viewport stays usable

#### Scenario: Header controls
- **WHEN** the user views the top bar
- **THEN** no standalone buttons for AI models or browser agents are present in the bar

#### Scenario: Breadcrumbs on mode page
- **WHEN** the user is on the Box mode page (`/gridfinity/box`)
- **THEN** the header shows breadcrumbs `PrintKit / Gridfinity / Box` in English, where `PrintKit` links to `/`, `Gridfinity` links to `/gridfinity`, and `Box` is the current page

#### Scenario: Breadcrumbs on product start page
- **WHEN** the user is on the Gridfinity chooser page (`/gridfinity`)
- **THEN** the header shows breadcrumbs `PrintKit / Gridfinity` in English, where `PrintKit` links to `/` and `Gridfinity` is current

#### Scenario: Always in English
- **WHEN** the user switches the interface language to Russian
- **THEN** the header breadcrumbs continue to display `PrintKit / Gridfinity / Box` in English

### Requirement: Product sections
The app SHALL be organised into product sections: Gridfinity, Keychain, and Rack (without the "Master" suffix), each with its own routes, localized description, and persisted state. Language and display units SHALL be shared by all sections.

#### Scenario: Switch product
- **WHEN** the user selects Keychain on the start page
- **THEN** the keychain route opens and the breadcrumb shows Keychain as the active product

#### Scenario: Products do not share parameters
- **WHEN** the user changes baseplate parameters, opens Keychain and returns
- **THEN** the baseplate parameters are unchanged

#### Scenario: Global settings
- **WHEN** the user switches the language or mm/in in one section
- **THEN** the other section uses the same language and unit

#### Scenario: Legacy links
- **WHEN** the user opens `#/baseplate`, `#/box` or `#/cutout`
- **THEN** the app shows the matching `/gridfinity/...` route

### Requirement: Start over
Every mode panel (box, baseplate, cutout, keychain image, keychain shape) SHALL have a "Start over" button in its header strip, reachable while all sections are collapsed, rendered as an icon button without text label. Activating it SHALL ask for confirmation and, once confirmed, return all parameters of that mode to their defaults. It SHALL NOT change the parameters of other modes, the language, the display units or the export settings.

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
The site SHALL show a beta badge as a Tabler icon button placed before "PrintKit" in the top bar. Activating the icon button SHALL open a disclaimer popover stating that the functionality is not fully tested: dimensions, fit and print settings may be wrong, the user should check the model and test-print a small part, and there is no warranty. The disclaimer SHALL be reachable from the icon button and repeated in the footer, in every language of the site.

#### Scenario: Label
- **WHEN** any page of the site is shown
- **THEN** the top bar shows the beta icon button positioned immediately before "PrintKit"

#### Scenario: Disclaimer from the label
- **WHEN** the user selects the beta icon button
- **THEN** the disclaimer text is shown and can be dismissed with Escape or by selecting outside it

#### Scenario: Footer
- **WHEN** a start page is shown
- **THEN** its footer repeats the disclaimer

#### Scenario: Language
- **WHEN** the interface language is Russian
- **THEN** the disclaimer popover and footer display translated text
