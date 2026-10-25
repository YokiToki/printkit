# Tasks

## 1. Texts

- [ ] 1.1 Settle the wording of the card descriptions and tags with the owner from the table in `design.md` (three product cards and every mode card, en and ru) and write the result into `design.md`. Verify: the owner confirms the table.
- [ ] 1.2 Update `products.*` and `start.*` in `en.json` and `ru.json` (descriptions and two tags each, no "soon", Russian terms translated, `keystone` written one way). Tests: key parity, every card has exactly two tags of at most two words, the words "soon" and "скоро" do not occur on cards, the Rack product description mentions panels, enclosures and shelves, the Cutout card mentions a photo.

## 2. README

- [ ] 2.1 Rewrite `README.md` after the structure in `design.md`: status line with the version and the changelog link, the motivation text identical to `site.motivation`, the full product and mode table, the privacy note, the commands, the layout of existing folders, the roadmap link, the references. Tests: the motivation text in the README equals the site's (extend `site.test.ts`), every folder named in the layout exists, the README names every mode of `app/modes.tsx`.

## 3. Illustrations

- [ ] 3.1 Keychain card: add `scripts/art/ring.jpg` (the PoC `ring.jpeg`), make `npm run art` render it through `generate('keychain')` (decoded with `jpeg-js`, size about 50 mm, the large area open and the small ones filled), drop the paw from the script (keep `paw.ts` until unused), and scale it with `KEYCHAIN_ART_RATIO` (about 0.8 of the box drawing's height, set by eye against the Gridfinity cards). Verify: `npm run art` writes `keychainImage.svg`, the weight is within 60 KB, the card looks level with the Gridfinity cards in the browser (en and ru, 390 px).
- [ ] 3.2 Rack cards at 1 U: panel `units: 1` with the Skadis pattern showing, a small device (about 25 mm high) in the enclosure with one keystone, shelf `units: 1`; the three drawn in one group at one scale with the Gridfinity margin. Verify: `npm run art` writes the three files within 60 KB, all three show a 1 U part, compared in the browser.
- [ ] 3.2a Colour by product: `Product.hue`, the two extra tone ladders and the logo colours in `theme.css`, `ModeArt` setting `data-hue` from the art id, `Logo` with a `hue` prop, `Header` passing the product's hue (blue on the root page). Tests: each art id maps to the right hue, the wrapper carries `data-hue`, the SVG files are unchanged (no colour literals, only classes), the logo gets the hue of the active route and blue without a product, the three ladders define all seven tones, the accent, focus and button tokens do not depend on the hue. Verify: compare the root page and the three start pages in the browser (Gridfinity blue, Keychain green, Rack yellow), the header logo on each product; tune the ladder values by eye.
- [ ] 3.3 `npm run art` writes `src/app/art/manifest.json` (every illustration's drawn width and height as fractions of the 250 × 165 field); a test asserts at least 6 % free space on each side of every illustration and that the Keychain Image drawing is not taller than the Gridfinity box. Update the art paragraph of `CLAUDE.md`. Tests: the margin test, the existing weight test.

## 4. Version

- [ ] 4.1 Bump to 1.7.1: `package.json` and a `CHANGELOG.md` entry `1.7.1 — 36-site-refresh`. Test: the existing version test passes with the new number.

## 5. Verification

- [ ] 5.1 `npm test` and `npm run build` are green, the dev server starts, no console errors.
- [ ] 5.2 In the browser, en and ru and at 390 px: the root page and the three product start pages show the new texts and tags, no placeholder, the Keychain Image card shows the ring emblem with its hole open and the Rack cards show 1 U parts, the card rows look level and have the same air, the pictures and the logo are blue, green and yellow for Gridfinity, Keychain and Rack while buttons, accents and focus rings keep their colours, the README reads correctly on GitHub.
