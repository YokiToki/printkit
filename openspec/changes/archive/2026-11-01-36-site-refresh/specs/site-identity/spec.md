# Spec Delta

## ADDED Requirements

### Requirement: README accuracy
The README SHALL describe the app as it is: every product with its modes and their main options, the beta status with where the version and the changelog are, a privacy note saying that the user's work and files stay in the browser and that visit counting happens only after the user accepts it, the commands, the layout of the folders that exist, a link to the roadmap, the references and the licence. Its motivation text SHALL be identical to the one on the site. The statement that there is no server and no account SHALL be followed by the privacy note.

#### Scenario: Products and modes
- **WHEN** the README is read
- **THEN** its product table lists every mode of the app, including Cutout from a photo, Keychain Image and Shape, and Rack Panel, Enclosure and Shelf

#### Scenario: Status and privacy
- **WHEN** the README is read
- **THEN** it says that the app is in beta, where the version and the changelog are, and that visit counting needs consent while photos and files never leave the browser

#### Scenario: Same motivation text
- **WHEN** the motivation text of the README and of the site are compared
- **THEN** they are identical

#### Scenario: Existing folders only
- **WHEN** the layout section of the README is read
- **THEN** every folder it lists exists in the repository
