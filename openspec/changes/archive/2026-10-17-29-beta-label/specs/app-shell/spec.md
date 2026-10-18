# Spec Delta

## ADDED Requirements

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
