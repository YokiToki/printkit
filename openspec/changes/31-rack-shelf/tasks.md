# Tasks

## 1. Geometry

- [x] 1.1 `geometry/rack/shelf.ts`: params, defaults, layout (plate height from units and tolerance, shelf width = 222.25 − 2 × clearance, lip limits), `validateRackShelf` (`rack.error.*` keys for units, thicknesses, depth, clearance, lip height above the plate). Tests: shelf width 221.75 by default and changes by twice the clearance change, plate height for 1, 2 and 10 U, a lip above the plate and a shelf thicker than the plate allows are rejected.
- [x] 1.2 Assembly: the plate from `plateBase` stood up, the shelf slab with the 0.01 mm overlap, the lips ring. Tests with `expectValidSolid`: one connected piece, bounding box (254 wide, plate height tall, depth plate thickness + shelf depth), lowest z is 0, the slab's underside is at z = 0, lips only on three sides (the front strip is open) with the set height and wall, lip height 0 gives a plain slab, ear holes on the standard grid, volume equals plate plus slab plus lips within 1 %.
- [x] 1.3 `ModeParams.rackShelf`, `generate('rackShelf')` returning one part `shelf`, migration normalising nested objects. Tests: parameters round-trip, partial stored data gets defaults, corrupt data falls back, an invalid state returns no part and the error key.

## 2. UI

- [x] 2.1 `ShelfMode` with sections Plate, Shelf and Ears (shared), persistence under `rack.shelf`, Start over, route `/rack/shelf`, third card on the Rack chooser with art `rackShelf` (`npm run art`, other pictures unchanged), en and ru strings. Component tests: collapsed by default, one highlight per change, steppers on every numeric input, error banners, key parity, three cards with hotkeys 1–3. No artboard: built from `ui/` and tokens, said in the commit.

## 3. Version

- [x] 3.1 Bump to 1.2.0: `package.json` and a `CHANGELOG.md` entry `1.2.0 — 31-rack-shelf`. Test: the existing version test passes with the new number.

## 4. Verification

- [ ] 4.1 `npm test` and `npm run build` are green, no console errors.
- [ ] 4.2 In the browser, en and ru and at 390 px: the default 2 U shelf stands on the ground plane with the plate at the front, lips on three sides appear and disappear with the height, the clearance changes the width, the model is one part, the STL exports with the expected bounding box without flipping.
