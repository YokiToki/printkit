# Spec Delta

## Purpose
Defines the component catalog infrastructure, decorators, story coverage, and rendering smoke verification for PrintKit UI components.

## ADDED Requirements

### Requirement: Component Catalog Environment
The development environment SHALL provide an isolated Storybook workspace running under Vite with Tailwind CSS v4 tokens, allowing interactive inspection of UI controls without loading the 3D geometry engine or WebGL viewport.

#### Scenario: Launching catalog
- **WHEN** the developer executes `npm run storybook`
- **THEN** the Storybook server starts and loads stories with PrintKit dark theme CSS applied

#### Scenario: Static catalog build
- **WHEN** the developer executes `npm run build-storybook`
- **THEN** static HTML and assets are generated into `storybook-static/` without TypeScript or bundler errors

### Requirement: Catalog Decorators
Storybook SHALL provide global toolbar controls to toggle the interface language between English and Russian, switch display units between millimetres and inches, and apply PrintKit dark theme backgrounds.

#### Scenario: Switching language
- **WHEN** the user switches the language toolbar item between EN and RU
- **THEN** all displayed story labels and tooltips update to the selected language using i18next

#### Scenario: Switching display units
- **WHEN** the user switches the unit toolbar item between mm and in
- **THEN** length fields dynamically recalculate and display values in the active unit while preserving stored millimeters

### Requirement: Foundation UI Stories
The component catalog SHALL provide stories for all reusable controls in `src/ui/` covering default, focused, disabled, error, and interactive states.

#### Scenario: LengthField story
- **WHEN** inspecting the `LengthField` story
- **THEN** stepper buttons (+/−), keyboard increment, and unit label are displayed and fully interactive

#### Scenario: Section story
- **WHEN** inspecting the `Section` story
- **THEN** collapsed state, modified orange summary highlight, and reset actions are demonstrated

### Requirement: Automated Story Smoke Verification
The test suite SHALL include an automated smoke test asserting that every declared component story mounts successfully in jsdom without runtime exceptions.

#### Scenario: Story test execution
- **WHEN** `npm test` runs
- **THEN** all stories are evaluated through portable stories and pass with zero unhandled errors
