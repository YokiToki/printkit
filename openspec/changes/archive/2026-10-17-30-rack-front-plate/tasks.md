# Tasks

## 1. Reference and geometry

- [x] 1.1 README references: the two MakerWorld models (keystone blank, keystone for other models) and a note that dimensions were measured from the owner's samples. Re-slice `tmp/keystone/*.stl` and the drawing, record the confirmed opening, ramp, latch notch, collar size and depth in `rack/spec.ts` with the source named in a comment. Test: constants pinned.
- [x] 1.2 `geometry/rack/keystone.ts`: the socket pocket (opening, ramp, notch) and the collar body from the constants, with a clearance setting. Tests with `expectValidSolid`: collar bounding box equals the constants, the opening at the face has the measured width and height, the notch and ramp depths, the pocket leaves a closed collar wall, one piece when unioned to a plate.
- [x] 1.3 `OpeningGroup` model and layout: `perRow` column / row / grid, zones left right above below, sequence of groups in a zone from the shell outward, centring, collar-outline fit check, named warnings, at most 6 groups. Tests: column, row and grid positions for known zones, two groups in one zone do not overlap, a group that does not fit is reported and not cut, zones above and below only exist when the plate is taller than the shell.
- [x] 1.4 Build: plate cut for the openings, collars unioned behind the plate, hole groups, window default and the closed plate option. Replace `keystones` and `cable` with `openings`, migration from the old fields (`migrateRackCase`). Tests: default is window with no groups, old settings load to the same plate, one connected solid, volume equals plate plus collars minus pockets within 1 %.

## 2. UI

- [x] 2.1 Front plate section with three headed blocks (Window, Keystones and holes, no wording about cables): the group list with add and remove, kind, count, per row, zone, hole diameter, the window switch and lip. en and ru strings, key parity, `cable` strings removed. Component tests: default window on, adding a group shows its fields, per-row changes the layout summary, group warnings, steppers on every numeric input, the old names are gone.

## 3. Version

- [x] 3.1 Bump to 1.1.0: `package.json` and a `CHANGELOG.md` entry `1.1.0 — 30-rack-front-plate`. Test: the existing version test passes with the new number.

## 4. Verification

- [x] 4.1 `npm test` and `npm run build` are green, no console errors.
- [x] 4.2 In the browser, en and ru and at 390 px: a socket group of three in a column, in a row and as a grid, holes in another zone, the collars behind the plate, a test export of one socket checked against the sample's dimensions; the render of the Enclosure card still reads (regenerate with `npm run art` if it changed).
