# Proposal

## Why

The site and the README were written when PrintKit had three Gridfinity modes and a panel. Since then it has gained Cutout from a photo and a circle, Keychain Image and Shape with text, areas and two halves, Rack Enclosure, Shelf and the Kumiko patterns, a beta label and a versioning rule. The texts did not follow:

- the Keychain product card still carries the tag "soon", the Rack product card describes panels only, the Cutout card tag "snap" and the Keychain Image tag "mask" mean nothing to a newcomer, and the Russian cards mix Latin terms ("keystone");
- the README's product table misses most of the modes and options, says nothing about the beta status, the version, the changelog or the analytics banner, and "No server. No account." needs the honest footnote that visit counting is optional and asks consent;
- the card illustrations are uneven: the Keychain Image card shows a paw that fills the whole field while the Gridfinity cards leave air around the part, and all three Rack cards show a 2 U part although the common case, and the default of the shelf, is 1 U.

## What Changes

- **Texts of the start pages (en and ru).** Rewrite the descriptions and tags of the three product cards and of every mode card so that each states what the part is and what is special about it, with no placeholders ("soon") and no private jargon ("snap", "mask"); two short tags per card, in the same style everywhere; Russian terms translated, a Latin term kept only when it is the name of a thing (Gridfinity, Skadis, keystone) and then in the same form on every card. The tagline, the title and the motivation text are checked against the current products.
- **README.** Bring it up to date: what is in each product and mode, the beta status and where the version and the changelog are, a short privacy note (the work stays in the browser; visit counting only after consent), the commands, the layout including folders that exist (for example `poc/`), the link to the roadmap, the references, and the badges. The motivation text stays identical to the one on the site.
- **Keychain card illustration.** Replace the paw by the ring emblem from the PoC (`poc/ai/samples/ring.jpeg`, an outlined emblem with a large through hole and sharp spikes), rendered by `npm run art` from that picture through the real Keychain Image pipeline, and reduce its scale so that it leaves the same air as the Gridfinity illustrations (which are the reference) instead of filling the field.
- **Rack card illustrations.** All three at 1 U: a 1 U Skadis panel, a 1 U enclosure around a small device, a 1 U shelf; one scale for the three Rack cards (the rack is the same width in all of them) with margins like the Gridfinity cards.
- **Colour by product, in the pictures and the logo only.** The start-page illustrations and the logo in the header take the hue of their product: Gridfinity stays blue (as now), Keychain green, Rack yellow. Only the hue of the illustrations' tone ladder and of the logo's faces changes; the interface (accent, buttons, borders, focus rings, text) keeps its colours in every product. The illustration files do not change (they carry only classes); the hue comes from token sets chosen by the product. On the root page and the start pages the logo stays blue as today.
- **A check for the margins.** `npm run art` records the drawn size of every illustration as a fraction of the card field in a small manifest, and a test keeps every illustration inside a margin and the Keychain illustration no larger than the Gridfinity box.

## Capabilities

### New Capabilities

### Modified Capabilities
- `app-shell`: the card texts and the start page illustrations.
- `site-identity`: the README must be accurate and consistent with the site.

## Impact

- `src/i18n/en.json` and `ru.json` (the `start.*` and `products.*` keys of the cards), `README.md`, `scripts/render-art.ts` (the ring source, the Rack models at 1 U, the scales), `scripts/art/ring.jpg` (the source picture), `src/app/art/{keychainImage,rackPanel,rackCase,rackShelf}.svg`, a new `src/app/art/manifest.json`, `ModeArt.test.tsx` and a margin test; `src/app/theme.css` (two more tone ladders and the logo colours per hue), `src/app/ModeArt.tsx` and `Logo.tsx` (a `hue` prop), `Header.tsx` (passes the product's hue); `CLAUDE.md` (the art paragraph).
- No change to geometry, modes or routes.
- Out of scope: new features, screenshots in the README, the product names, the footer and consent texts, texts of the workspaces (panels, sections), texts of the AI changes (they add their own when they land), redrawing the Gridfinity or Keychain Shape illustrations.
- Version 1.7.1 (patch: content and illustrations, no new capability).
- Depends on: `29-beta-label` (the versioning rule); the art uses geometry that is already in the app.
