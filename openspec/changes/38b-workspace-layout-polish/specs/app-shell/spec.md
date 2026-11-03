# Spec Delta

## MODIFIED Requirements

### Requirement: Mode navigation
Inside Gridfinity Master the app SHALL offer three modes — Box, Baseplate and Cutout — selectable from the top bar, each reachable by its own URL path under `/gridfinity`. The top bar SHALL show the product switcher, the mode switcher, unit and language selectors, and the GitHub link, and SHALL NOT show separate buttons for AI models or agents.

#### Scenario: Switch mode
- **WHEN** the user selects Baseplate in the mode switcher
- **THEN** the URL path changes to the Gridfinity baseplate route and the baseplate parameter panel is shown

#### Scenario: Direct link
- **WHEN** the user opens the Gridfinity baseplate URL directly
- **THEN** the baseplate mode is shown without first visiting another mode

#### Scenario: Unavailable mode
- **WHEN** a mode or product has no implementation yet
- **THEN** a localized placeholder is shown in place of its parameter panel and the 3D viewport stays usable

#### Scenario: Header controls
- **WHEN** the user views the top bar
- **THEN** no standalone buttons for AI models or browser agents are present in the bar

### Requirement: Start page
The app SHALL open on a start page at the root path that lets the user choose Gridfinity Master, Keychain Master or Rack Master, each as a card with an icon, a short localized description and a link. Gridfinity Master SHALL have its own start page at `/gridfinity` where the user chooses Box, Baseplate or Cutout, and Rack Master SHALL have its own start page at `/rack` where the user chooses among its modes. Choice cards SHALL have a width of 360 px and a fixed height of 470 px, and their tags SHALL stay strictly within card bounds without overflowing.

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

#### Scenario: Card dimensions and tag containment
- **WHEN** choice cards are rendered on the start page
- **THEN** each card has a width of 360 px, a height of 470 px, and all tag texts fit within the card without horizontal or vertical overflow

### Requirement: Shared parameter controls
Parameter panels SHALL be composed from shared controls: numeric field with unit label, segmented choice, on/off toggle and collapsible section. Control labels SHALL never be clipped in English or Russian at the 380 px panel width. Every collapsible section SHALL be collapsed when its panel is first shown, whatever the stored parameters are. A section SHALL show a summary of its settings opposite its title; when those settings differ from their defaults the summary SHALL be highlighted in an orange accent colour taken from the theme, otherwise it SHALL use the muted text colour. A section whose summary is not a setting (a file name, a list of items) SHALL never be highlighted. In the editor workspace, the entire parameter panel sidebar SHALL be collapsible via a toggle button, expanding the 3D viewport to full workspace width.

#### Scenario: Collapse parameter sidebar
- **WHEN** the user activates the sidebar collapse toggle in the editor workspace
- **THEN** the parameter sidebar is hidden and the 3D viewport expands to occupy the full width of the workspace

#### Scenario: Expand parameter sidebar
- **WHEN** the user activates the sidebar expand toggle while the sidebar is collapsed
- **THEN** the parameter sidebar is restored to its 380 px width

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
