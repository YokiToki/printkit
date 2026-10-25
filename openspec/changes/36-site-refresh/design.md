# Design

## Context

Card texts are i18n keys: `products.<id>.{name,desc,tag1,tag2}` for the root page and `start.<mode>.{desc,tag1,tag2}` for the mode pages, with a parity test between `en.json` and `ru.json`. Illustrations are SVG files rendered by `scripts/render-art.ts` from `generate()` meshes in groups with their own scale (Gridfinity three with one scale, Keychain two, each Rack part alone); the Keychain card is aligned to the box by `BOX_ART_HEIGHT`. `ModeArt.test.tsx` checks the 60 KB budget.

## Goals / Non-Goals

**Goals:**
- Texts that say what each card is, in the same style, without placeholders or jargon, in both languages.
- A README that matches the product.
- Illustrations that sit on the same visual line, with the Gridfinity cards as the reference.

**Non-Goals:**
- New copywriting for workspaces, screenshots, marketing pages.

## Decisions

- **Card text rules.** A description is one or two sentences: what you get, then the one thing that makes it useful; it names the input when there is a special one (a photo, an image, a device). Two tags per card, each at most two short words, nouns or noun phrases, no arrows except "image → relief" and "device → shell" where the arrow is the point; no status words (soon, new, beta). Russian: translated, sentence case, no Latin words except names; "keystone" is written as a name (`keystone`) in the same form on every card.
- **Proposed texts (to be confirmed by the owner in the first task).**

  | Card | EN description | EN tags | RU description | RU tags |
  |---|---|---|---|---|
  | Gridfinity Master | Parametric Gridfinity bins, baseplates and tool cutouts, with pockets traced from a photo. | bins · baseplates; tool cutouts | Параметрические контейнеры и плиты Gridfinity, вырезы под инструменты, в том числе по фото. | контейнеры · плиты; вырезы под инструмент |
  | Keychain Master | Turn a picture or a plain shape into a relief keychain: silhouette, height pattern, text, ring mount, two halves with pins. | image → relief; shapes · text | Брелок-рельеф из картинки или простой фигуры: силуэт, узор высоты, надпись, крепление под кольцо, две половинки со штифтами. | картинка → рельеф; фигуры · надпись |
  | Rack Master | Parts for a 10-inch rack: panels with patterns, enclosures around a device and shelves, with standard ear holes. | 1–10 U; panels · cases · shelves | Детали для 10-дюймовой стойки: панели с узорами, корпуса под устройство и полки со стандартными отверстиями в ушах. | 1–10 U; панели · корпуса · полки |
  | Cutout | A bin with pockets shaped to your tools: from a photo on a sheet of paper, an STL, a circle or a rectangle. | from photo; STL import | Контейнер с гнёздами под ваши инструменты: по фото на листе бумаги, из STL, круг или прямоугольник. | по фото; импорт STL |
  | Keychain Image | A relief keychain from a picture: a drawing, logo or emblem becomes a silhouette with a height pattern, text and a ring mount. | image → relief; text · mounts | Брелок-рельеф по картинке: рисунок, логотип или эмблема становятся силуэтом с узором высоты, надписью и креплением под кольцо. | картинка → рельеф; надпись · крепление |
  | Rack Enclosure | A front plate with rack ears and a shell around your device: mini PC, switch or router. Window, `keystone` sockets, holes and vents. | device → shell; keystone sockets | Передняя панель с ушами и оболочка вокруг устройства: мини-ПК, коммутатор или роутер. Окно, гнёзда `keystone`, отверстия и вентиляция. | устройство → корпус; гнёзда keystone |

  Box, Baseplate, Keychain Shape, Rack Panel and Rack Shelf keep their descriptions and get tags in the same style ("grid × height", "compartments"; "fractional cells", "split to the bed"; "shapes", "rim"; "1–10 U", "patterns"; "plate + shelf", "ventilated"). The final wording is settled in task 1.1.
- **README structure.** Title and one-line pitch (unchanged); a status line (beta, current version, link to the changelog); Why this exists (the motivation text, identical to the site); What you get: the product table with every mode and its main options, the highlights; Privacy: the work stays in the browser, photos and files are never uploaded, visit counting only after consent and the repository link to its settings; Quick start and commands; Deploy; How it works; Project layout (listing the folders that exist, such as `poc/`); Roadmap and changes (`openspec/ROADMAP.md`, `CHANGELOG.md`); References; License. The statement "No server. No account." is kept for the app and followed by the privacy note. A test (or the existing `site.test.ts`) checks that the motivation text in the README equals the site's.
- **Keychain art from the ring emblem.** `scripts/art/ring.jpg` is the PoC picture; `npm run art` decodes it with `jpeg-js` (already a dev dependency), makes a `GrayImage`, runs the Keychain Image pipeline (`generate('keychain')`) with default relief and size about 50 mm, the large enclosed area opened (the emblem's hole) and the small ones between strokes filled (the same rule as the areas of change 18), and draws it like the other keychain art, with the existing smoothing. No eyelet is added: the emblem already has a through hole, and an eyelet on a spiky silhouette looks accidental; the alternative is a small eyelet at the top spike, rejected for the look. The paw module `geometry/art/paw.ts` stays for tests until it is no longer used, then is removed.
- **Scale and air.** The Gridfinity cards are the reference: their drawing keeps the margin that the owner is happy with. The Keychain Image card is scaled so its drawn height is a fixed fraction of the box drawing's (`KEYCHAIN_ART_RATIO`, about 0.8, set by eye against the cards in the browser and written down) instead of equal to it, and the width limit stays. Every illustration is measured by `projectedSize` in the script and written to `src/app/art/manifest.json` as fractions of the 250 × 165 field; the test asserts at least 6 % of free space on each side for every card and that the Keychain Image drawing is not taller than the Gridfinity box.
- **Rack at 1 U.** The panel is `defaultRackPanel` with `units: 1` and the Skadis pattern (the 1 U plate has less room, so the pattern's region is checked: a plate that shows no pattern element is not acceptable, the pattern pitch may be reduced for the art only); the enclosure uses a small device (about 25 mm high so that the shell fits 1 U) with one keystone; the shelf uses `units: 1` with the default shelf and side walls capped to what a 1 U plate allows. The three Rack drawings share one scale chosen so the widest of them (the 254 mm width) fits the field with the Gridfinity margin; they are drawn in one group of the script, which also makes their sizes comparable.
- **Hue per product.** `Product.hue: 'gridfinity' | 'keychain' | 'rack'` (the id doubles as the hue name). `theme.css` keeps `--color-art-0…6` for Gridfinity (blue, unchanged) and adds `--color-art-keychain-0…6` (green) and `--color-art-rack-0…6` (yellow), with the same lightness steps as the blue ladder so shading reads the same; the edge colour is shared. `ModeArt` gets the hue from the art id (`box`, `baseplate`, `cutout` → Gridfinity; `keychainImage`, `keychainShape` → Keychain; `rackPanel`, `rackCase`, `rackShelf` → Rack) and sets `data-hue` on its wrapper; the rules `[data-hue=keychain] .art-t0 { fill: var(--color-art-keychain-0) }` and so on override the fills, so the SVG files are untouched and the card art still follows the tokens. Starting values (to tune by eye against the dark surface): green `#1b2a22 #25402f #345a43 #437557 #58926d #78b08a #a1cfb0`, yellow `#2a2814 #45401a #625b21 #827927 #a39a33 #c5bb52 #e3dc86`. Yellow is kept warm-yellow, not orange, so it does not read as the Okabe–Ito orange of the cutout colours.
- **Logo.** `Logo` takes `hue` and draws its faces from tokens `--color-logo-{top,left,right}` per hue (blue `#7c9cff / #4a63b8 / #34478f` as now; green about `#7edc9d / #3f9a5e / #2e7547`; yellow about `#f0d95c / #b89e2a / #8a7620`), the dark outline unchanged. `Header` passes the active product's hue; on the root page and on routes without a product the logo is blue. The product name text, the buttons and everything else in the header keep their colours.
- **Not coloured.** The interface accent (`--color-accent`), focus rings, selected states, banners and the 3D viewport keep their colours in all products; only the pictures and the logo are coded by product. The colour is never the only cue: the product name and icon stay.
- **Weight and tokens.** The 60 KB budget and the colour tokens stay; if a 1 U drawing is heavier, the smoothing or the trace tolerance is raised for it.

## Risks / Trade-offs

- [The ring is a drawing, so the render is a flat plaque with the emblem's silhouette] → the relief profile (bevel) and the two tone passes give it volume; if it looks flat the default profile "dome" is used for the art only.
- [A 1 U panel is a very thin strip and looks small on the card] → the shared Rack scale and the isometric view keep it readable; the card height does not change; the check is by eye in the browser.
- [Texts drift again] → the style rules are in the spec; a test keeps the tags to two per card and at most two words each, and forbids the words "soon" and "скоро" on cards.
- [Green and yellow art looks muddy on the dark card] → the ladders keep the lightness steps of the blue one, values are tuned by eye in the browser; the 6 % margin and weight checks do not depend on colour.
- [The README repeats the specs] → it stays a summary with links, not a copy.

## Open Questions

- The exact wording of the cards and the README is the owner's call; the table above is the proposal.
- Whether the ring eyelet question should be revisited after seeing the render.
