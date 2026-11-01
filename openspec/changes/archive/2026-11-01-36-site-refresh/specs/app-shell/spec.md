# Spec Delta

## MODIFIED Requirements

### Requirement: Start page illustrations
Each mode card on the Gridfinity, Keychain and Rack start pages and each product card on the root start page SHALL show an isometric illustration that is a render of an actual model produced by the app (a small part with default settings), not a schematic drawing or an icon. The Gridfinity product card SHALL show the box; the Keychain product card SHALL show an image-mode keychain; the Keychain Image and Shape cards SHALL each show a render of their own mode. The image-mode keychain illustration SHALL show a keychain made from a drawing with a complex outline (the ring emblem with sharp spikes and a large through hole), not a circle or other plain geometric figure. The Rack illustrations SHALL show 1 U parts. Illustrations SHALL be static vector images, SHALL follow the app's colour tokens, and SHALL NOT require WebGL, geometry computation or network requests on the start page.

#### Scenario: Renders match the editor
- **WHEN** the Baseplate card is shown
- **THEN** its illustration is a 2×2 baseplate with the standard cell pockets and the default corner fastener holes, as the editor produces by default

#### Scenario: Product cards
- **WHEN** the root start page is shown
- **THEN** the Gridfinity card shows the box illustration and the Keychain card shows the image-mode keychain illustration

#### Scenario: Keychain mode cards
- **WHEN** the Keychain start page is shown
- **THEN** the Image card shows a relief keychain made from the ring emblem, with its through hole open and its spikes sharp, and the Shape card shows a keychain with a geometric outline and rim, each a render of what that mode produces

#### Scenario: Rack cards at 1 U
- **WHEN** the Rack start page is shown
- **THEN** the Panel, Enclosure and Shelf illustrations each show a part one rack unit high, drawn at one common scale

#### Scenario: Smooth outline
- **WHEN** the Keychain Image illustration is viewed at 200 % zoom or on a high-density display
- **THEN** its outer outline and the edges between shaded areas are smooth curves, with no visible pixel stairs

#### Scenario: Cards stay level
- **WHEN** the root start page is shown
- **THEN** the drawn height of the Keychain illustration is not greater than that of the Gridfinity box illustration, so the Keychain card does not look larger than its neighbour

#### Scenario: Same air on every card
- **WHEN** the start pages are shown
- **THEN** every illustration leaves a margin of at least 6 % of the card's picture field on each side, the Keychain Image illustration is not taller than the Gridfinity box illustration, and none looks larger than its neighbours in the same row

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

## ADDED Requirements

### Requirement: Card texts
Every product and mode card SHALL have a localized description and exactly two short tags. The description SHALL say what the part is and name the special input when there is one (a photo, an image, a device); each tag SHALL be at most two short words, a noun or a noun phrase. Cards SHALL NOT show status words such as "soon", "new" or "beta" as tags, and SHALL NOT use internal jargon. In Russian, terms SHALL be translated except for names of things (Gridfinity, Skadis, keystone), which SHALL be written the same way on every card. The descriptions of the product cards SHALL cover the modes that exist.

#### Scenario: No placeholders
- **WHEN** the root start page is shown
- **THEN** no card carries a tag that says it is coming soon, and the Keychain card describes what it makes

#### Scenario: Rack card covers its modes
- **WHEN** the root start page is shown
- **THEN** the Rack card's description mentions panels, enclosures and shelves

#### Scenario: Cutout card
- **WHEN** the Gridfinity start page is shown
- **THEN** the Cutout card says that pockets can be made from a photo of the tools on a sheet of paper as well as from an STL, a circle or a rectangle

#### Scenario: Two short tags
- **WHEN** any card is shown
- **THEN** it has exactly two tags of at most two words each, in English and in Russian

#### Scenario: Same term everywhere
- **WHEN** the Russian cards are read
- **THEN** a name such as keystone is written the same way on every card where it occurs

### Requirement: Product colour in illustrations and logo
The start-page illustrations and the logo in the top bar SHALL take the hue of their product: blue for Gridfinity, green for Keychain and yellow for Rack. Only the hue of the illustrations and of the logo SHALL differ; the colours of the interface (accent, buttons, borders, focus, text, banners) and of the 3D viewport SHALL be the same in every product. The logo SHALL be blue where no product is active. The illustrations SHALL keep following colour tokens.

#### Scenario: Cards by product
- **WHEN** the root start page is shown
- **THEN** the Gridfinity card illustration is blue, the Keychain one green and the Rack one yellow

#### Scenario: Mode cards
- **WHEN** a product's start page is shown
- **THEN** all its mode illustrations have that product's hue

#### Scenario: Logo
- **WHEN** the user opens a product
- **THEN** the logo in the top bar has that product's hue, and on the root page it is blue

#### Scenario: Interface unchanged
- **WHEN** the user moves between products
- **THEN** buttons, selected states, focus rings and links keep the same colours

#### Scenario: Token driven
- **WHEN** a hue token changes
- **THEN** the illustrations of that product change with it without regenerating the image files

