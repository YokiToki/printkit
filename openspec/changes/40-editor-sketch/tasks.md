# Tasks

## 1. Spikes (decide before building)

- [ ] 1.1 Solver: in a throwaway test file, implement a Levenberg–Marquardt solver for 6 constraint kinds (coincident, horizontal, distance, radius, tangent line–circle, angle) and compare it with `planegcs` on three reference sketches (rounded rectangle, slot, bracket with 4 holes, 200 entities): solve time, nearest-solution behaviour when a dimension changes, DoF and conflict reporting, licence, WASM size. Record the numbers and the decision in `design.md` (Decision 3, Open Questions). If neither is acceptable, stop for `/opsx:update`.
- [ ] 1.2 Edge break: build the mitre-offset loft (chamfer and fillet) on a rounded rectangle with a hole and a slot, check `expectValidSolid`, volume against the analytic value and collapse limits; record in `design.md` (Decision 8) how much ships (chamfer and fillet, or chamfer on convex profiles only).

## 2. Sketch data and solver (React-free, `src/editor/sketch/`)

- [ ] 2.1 `model.ts`: `Sketch`, `Curve`, `Constraint` types, `Plane` and `planeFrame` (to world and back), id generation, point merging, helpers (`addLine`, `addCircle`, `addArc`, `removeCurve` cleaning orphans and constraints). Test: plane frames for XY/XZ/YZ with offset (round trip), merging, removal leaves no dangling refs.
- [ ] 2.2 `solver.ts` per the spike: residuals and Jacobians for every constraint kind of Decision 2, nearest-solution damping, drag residual, tolerance and iteration limits, `solve(sketch, {drag?}) → {positions, ok, reason, residuals}`. Test per constraint kind (a minimal sketch that must satisfy it), a rounded rectangle, a triangle that must not flip, an impossible dimension keeping positions, and a 200-entity sketch within the time budget of the spike.
- [ ] 2.3 `dof.ts`: DoF count, per-entity "fully defined" flags, conflicting and redundant constraint sets. Test: rectangle with 0/1/2/4 dimensions (DoF 5/4/…/fully defined), two contradicting constraints named, a redundant dimension flagged but still solved.
- [ ] 2.4 `infer.ts`: snap candidates and the constraints they imply (priority order of Decision 5), thresholds in screen pixels converted by the view scale. Test each rule and the priority between them, Ctrl off.
- [ ] 2.5 Macros in `tools/`: `rectangle` (with corner radius), `slot`, `polygon`, `fillet`, `chamfer`, `trim`, `mirror` as pure `(sketch, args) → patch`. Test: constraint counts and DoF of each result, fillet radius limits and the message value, changing the rounded-rectangle radius updates all four arcs, trim at intersections of line/line, line/circle.
- [ ] 2.6 `migrate.ts` and the `SceneDoc.sketches` field (optional, schema 1): normalise every number, drop constraints with missing refs with a log entry, re-solve on load when positions disagree with constraints by > 1e-6. Test: corrupt sketch, partial sketch, missing refs, round trip.

## 3. Profiles and features (geometry, no React or three.js)

- [ ] 3.1 `geometry/features/profile.ts`: graph of non-construction curves, cycles, open ends and crossings with positions, orientation, nesting (holes), adaptive discretisation, region ids. Test: square, square with hole, two separate squares, nested three levels, open gap reported with its position, crossing loops reported, circle segment counts, arcs sweep direction.
- [ ] 3.2 `extrude.ts` and `revolve.ts`: one, symmetric and two-sided extrusion; revolve with sketch line or plane axis; errors `sketch.error.*`. Test with `expectValidSolid`: 40 × 20 × 10 volume 8000 and bbox, symmetric bbox, plate with hole volume, rounded rectangle area, revolve ring volume against Pappus within tolerance, axis crossing refused, zero distance refused.
- [ ] 3.3 `edgeBreak.ts` per the spike: chamfer and fillet of top and bottom caps with collapse limits. Test: volume against the analytic value for a box and a rounded rectangle, a hole and a slot follow the profile, too-large size gives the warning and no break, result is a valid solid.
- [ ] 3.4 `evaluate.ts`: `evaluateFeatures(features, sketches, quality)` (New, Join, Cut, Intersect in order, stop at the first failure and return the previous solid with the failed index and reason); `geometry/model.ts`: source kind `feature` in `generate('editor')`, cache key by description. Test: plate + cut hole volume, a failing second feature keeps the first result, missing sketch is a failure not a crash, cache hit on identical input, quality changes the segment count only.

## 4. Viewport sketch layer

- [ ] 4.1 `Viewport` optional `sketch` prop and `onSketchPointer`: plane grid, curves, points, dashed construction, selection and hover highlight, preview geometry, plane coordinates from pointer rays, orthographic look-at, rotation locked. Generator modes and the scene mode of `39` unchanged. Test (three mocked in jsdom): pointer to plane coordinates for each base plane and offset; pure helpers `screenPick` (6 px) and `lookAtPlane`.
- [ ] 4.2 Constraint glyphs and dimension labels (DOM labels positioned from plane coordinates, in-place editing with `LengthField`), colours by DoF status from theme tokens (blue, black, red). Browser check in both languages and both themes.

## 5. Sketch UI (no artboard exists: built from `ui/` components and tokens; compare with the wireframes in `design.md`)

- [ ] 5.1 Sketch mode shell: Add → Sketch with plane choice, enter/finish, tool bar swap, status line (`Sketch 1 · n DoF`), "Sketches" group in the outliner (rename, show/hide, edit, delete with the dependency confirmation). Component tests for each action; compare at 1280 px and 390 px, en and ru.
- [ ] 5.2 Tool state machines and `SketchToolbar`: Select, Line, Rectangle▾, Circle, Arc▾, Slot, Polygon, Fillet, Chamfer, Trim, Mirror, Construction, Dimension, Constraints▾; typed values while drawing; hotkeys of Decision 14 through the registry of `39`; inference glyph next to the cursor. Test the state machines as pure reducers (event sequences → patches) and the toolbar enabling rules.
- [ ] 5.3 `ConstraintPanel` in Properties: selected curve, constraint list with delete and hover highlight, dimension list with `LengthField` / `NumberField` (angle in degrees), conflict and redundancy marks, "Fix" actions. `stepperAssert` passes. Component test: editing a dimension solves and is one history step; conflict is named.
- [ ] 5.4 All sketch commands through `dispatch(label, patch, mergeKey)`; drag and typed values merge; undo restores positions without solving. Test: each command undoable, merge, redo cleared.

## 6. Feature UI

- [ ] 6.1 `FeatureDialog` for Extrude and Revolve (side panel, not a modal): sketch picker, region picking by clicking in the view, distance fields (`LengthField`), side, operation, top/bottom edge break, axis for Revolve, live preview at coarse quality through the same pipeline, OK/Cancel as one history step. Component tests and a browser check of preview vs result.
- [ ] 6.2 Feature list under the body (outliner and properties): edit, delete, failed marking with the reason, plain-language error messages from `sketch.error.*` / `sketch.warning.*`. Test: delete recomputes, failed feature marked, later features skipped.
- [ ] 6.3 Export and measurements: the bodies from features are ordinary editor objects for transform, selection and export (`39`); check bbox and volume from `generate` against the STL of the export.

## 7. SVG import

- [ ] 7.1 `geometry/svg.ts`: path commands (absolute and relative M L H V C S Q T A Z), basic shapes, group transforms, units and Y flip, flattening tolerance, limits, notices for ignored content, endpoint joining. Test with inline SVG fixtures: closed path with hole, arcs staying arcs under similarity, rotated group, relative commands, 50 000-segment limit, text ignored with a notice.
- [ ] 7.2 Import dialog (file, drop on the sketch, plane choice for a new sketch, scale: units or "fit width to N mm"), log entries (names and sizes only). Component test of the dialog and an end-to-end test: SVG → sketch → extrude → valid solid.

## 8. Strings and persistence

- [ ] 8.1 Strings for everything above in `en.json` and `ru.json`, including `sketch.error.*`, `sketch.warning.*`, constraint and tool names, `log.editor.sketch.*` (key-parity test must pass).
- [ ] 8.2 Persistence: sketches and features in `editor.scene`, old scenes of `39` load unchanged, deleted sketch handling, reload test with a plate, a hole and a failed feature.

## 9. Version

- [ ] 9.1 Bump `package.json` to 1.11.0 and add `1.11.0 — 40-editor-sketch` at the top of `CHANGELOG.md`. Test: `site.test.ts` passes.

## 10. Verification

- [ ] 10.1 `npm test` and `npm run build` are green, the dev server starts, the console has no errors; generators and the foundation of `39` work as before.
- [ ] 10.2 In the browser, en and ru, desktop and 390 px: draw a rounded rectangle with a radius dimension, add a slot and four holes, constrain it to fully defined, extrude it, cut the holes, change the width and the radius and watch the body follow, add a revolved knob from a profile, import an SVG outline and extrude it, undo and redo through all of it, reload and compare, export STL and check bbox and volume against the numbers typed.
