# Tasks

The mode exists as a first draft (flat slab, standing plate, lips); the tasks below rebuild it to the new design. The draft's route, card, persistence and `generate` case stay.

## 1. Geometry

- [x] 1.1 `geometry/rack/shelf.ts` params and validation: units, plate thickness, corner radius, tolerance, ears, `shelf {depth, thickness, clearance}`, `sides {height, wall}`, `floorPattern` and `platePattern` (`PatternParams`; defaults pills and none); `shelfLayout` (plate height, width = 222.25 − 2 × clearance, floor and plate pattern regions); `validateRackShelf` with the keys of the design (lip keys removed). Tests: width 221.75 by default and twice the clearance change, plate height for 1, 2 and 10 U, the pattern regions, a side height above the plate and a floor thicker than allowed are rejected.
- [x] 1.2 Assembly in the print frame (plate flat on the bed, front face at z = 0, floor and sloped side walls standing on the back face): floor slab, two wall prisms with the straight slope, the 0.01 mm overlaps, the floor pattern cut through the floor outside the walls, the plate pattern cut through the plate, `rack.error.disconnected` when a pattern splits the part. Tests with `expectValidSolid`: one connected piece, bounding box (254 wide, plate height tall, thickness + depth high), lowest z is 0 and the front face is on it, floor flush with the plate's lower edge, the wall profile (height at the plate, straight slope to the floor at the back, no holes), side height 0 gives a floor only, solid floor with pattern `none`, the default floor has openings through it, plate pattern off by default and cutting when set, ear holes unchanged, volume equals plate plus floor plus walls minus the patterns within 1 %.
- [x] 1.3 `generate('rackShelf')` and the migration: new fields normalised, the stored `lips` of the draft dropped, partial and corrupt data fall back to defaults, an invalid state returns no part and the error key. Tests: round trip, old draft record, corrupt data, export without flipping (254 × 103 × 88.45 in some orientation of the bed, lowest z = 0 with the front face down).

## 2. UI

- [x] 2.1 Make `PatternSection` edit a `PatternParams` (props: the pattern, its defaults, the title keys, update callback) and use it in the panel mode unchanged in look and behaviour. Existing panel tests stay green.
- [x] 2.2 `ShelfPanel` rewritten: sections Plate (with the plate pattern), Shelf (depth, floor thickness, clearance, side wall height and thickness, the floor pattern), Ears; the lips fields removed; `rack.shelf.*` and error strings in en and ru, key parity. Card art `rackShelf` redrawn (`npm run art`, other pictures unchanged). Component tests: collapsed by default, one highlight per change, steppers on every numeric input, the floor pattern defaults to pills and `none` hides its fields, the plate pattern defaults to none, error and warning banners, three cards with hotkeys 1–3. No artboard: built from `ui/` and tokens, said in the commit.

## 3. Version

- [x] 3.1 Version stays 1.2.0 (the draft was never released): check `package.json` and the `CHANGELOG.md` line read 1.2.0 and update the changelog text to the new shape. Test: the existing version test passes.

## 4. Verification

- [x] 4.1 `npm test` and `npm run build` are green, no console errors.
- [x] 4.2 In the browser, en and ru and at 390 px: the default 2 U shelf lies on the ground plane with its front face down, the slotted floor and the sloped side walls rise from it, a solid floor and the plate pattern switch on and off, the clearance changes the width, the model is one part, the STL exports with the expected bounding box without flipping.
