# Tasks

## 1. Spike

- [ ] 1.1 Cut: verify `splitByPlane`, `trimByPlane` and `slice` in the installed `manifold-3d` on a bracket and an imported closed STL; check that both halves are closed and volumes add up, record timings; prototype pole-of-inaccessibility and farthest-point placement on three sections (rectangle, L, ring) and record the result in `design.md` Decision 4.
- [ ] 1.2 Reuse: list which of `rasterizeText`, `textOutline`, the font loaders and connector presets are feature-private; decide the shared module layout (Decision 5, 8) and note it in `design.md`.

## 2. Cut geometry (React-free)

- [ ] 2.1 `geometry/cut/plane.ts`: plane definitions (axis+position, normal+point, three points, from face frame), `cutSolid`, keep-one-side, slice into N; labels. Test with `expectValidSolid`: volumes add up, bboxes, closed caps, arbitrary 30° plane, open input refused.
- [ ] 2.2 `geometry/cut/split.ts`: `autoCuts` (fewest parts, even spread, small-section preference within ±10 %), usable bed from `usableBed`, grid split order, oversize flags. Test: 500 × 100 on a 256 bed, rotated block, manual cut kept after a printer change.
- [ ] 2.3 `geometry/connectorSpec.ts` extracted from `connectors.ts` (presets, clearances) without changing the baseplate: existing `connectors.test.ts`, `split.test.ts` and baseplate volume tests stay green.
- [ ] 2.4 `geometry/cut/section.ts` and `place.ts`: section polygons at a plane, inset, pole of inaccessibility, farthest-point placement, manual positions in plane coordinates. Test the placement on the three reference sections and thin sections.
- [ ] 2.5 `geometry/cut/connectors.ts`: peg/socket, pin holes, magnet pockets, dovetail solids, depth limited by the material behind the cut (ray distance), fit checks with `cut.connector.*` keys. Test: volumes of pegs and sockets, depth limit on a thin part, outside/overlap detection, dovetail joins (A key fits B socket with clearance, no overlap beyond it).

## 3. Holes and text operations

- [ ] 3.1 Hole data: `geometry/holeSpec.ts` with M2–M5 clearance, head and insert tables and magnet sizes (hand-written, cited in the README references). Test: table sanity (monotonic, clearance > thread).
- [ ] 3.2 `geometry/features/ops/hole.ts`: tool solids for each type along `(point, normal, up)`, through extension, evaluator integration as a generated tool. Test: simple/counterbore/countersink volumes against formulas, inclined normal axis, through exits, blind depth.
- [ ] 3.3 Move text shape code to `geometry/textShapes.ts` (Keychain tests stay green); `geometry/features/ops/text.ts` emboss/engrave with overlap offsets and curved-surface warning. Test: engraved volume ≈ glyph area × depth, embossed body stays one solid, warning on a cylinder.
- [ ] 3.4 Wire both operations into the stack of `41` (kinds, normalisation, summaries, migration passthrough). Test: round trip through `migrateScene`, failed-op behaviour.

## 4. Document and worker

- [ ] 4.1 `doc.cuts`, `cutPart` sources, normalisation and orphan handling; `generate('editor')` derives parts from groups (source evaluated once per group, cache key by group definition). Test: deleting the group restores the source, parts rebuilt after reload, source edit updates parts, cache hit counts.
- [ ] 4.2 Export: derived parts with unique names, loose pins as parts, tool/ghost rules of `41` unchanged. Test the export set and names.

## 5. UI (no artboard exists: built from `ui/` components and tokens)

- [ ] 5.1 Cut tool: plane widget in `Viewport` with the gizmo, axis snapping, plane from face (uses `42` picking), three points, mode selector (both / keep one / slice N), cut position field (`LengthField`), preview of the section in an inset panel. Component tests for the form and helpers for the plane maths; browser check.
- [ ] 5.2 Split dialog and group UI in the outliner (group, parts, source, explode gap slider, per-cut positions), oversize marks. Component tests.
- [ ] 5.3 `ConnectorEditor`: type and preset pickers, size/depth/clearance fields, count, margin, section preview with draggable markers, issue list with keys. Component tests: drag, add, remove, issues shown.
- [ ] 5.4 Hole tool: surface picking marker, form with type and preset, offsets, depth/through, live preview; Text tool form with font picker (reuse the list), size, spacing, depth/height, rotation, placement by click; both create stack operations. Component tests and a browser check on an inclined face.
- [ ] 5.5 Strings in `en.json` and `ru.json` (`cut.*`, `hole.*`, `text.*`, `cut.connector.*`, log keys); key parity.

## 6. Version

- [ ] 6.1 Bump `package.json` to 1.14.0 and add `1.14.0 — 43-editor-cut-split` to `CHANGELOG.md`. Test: `site.test.ts`.

## 7. Verification

- [ ] 7.1 `npm test` and `npm run build` are green, the dev server starts, no console errors; the Gridfinity baseplate split and connectors work as before.
- [ ] 7.2 In the browser, en and ru, desktop and 390 px: split a long model for a Bambu bed with pegs and magnets, print-check the part sizes in the export panel, move a cut and see parts update, cut at 30° from a face, put M3 counterbored holes and magnet pockets on a top face and a tilted face, add engraved and embossed text including Cyrillic, export STL/3MF and verify bbox, volumes and part names.
