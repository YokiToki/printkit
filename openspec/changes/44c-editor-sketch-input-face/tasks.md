# Tasks

## 1. Universal Tool HUD Input System

- [ ] 1.1 Implement declarative HUD descriptors for circle, arc, point, and polygon in `src/features/viewport/sketchHudSchema.ts`. Test: unit test validating stage transitions and field schemas.
- [ ] 1.2 Refactor `SketchOverlay.tsx` to render floating HUD inputs according to the active tool schema with Tab cycling, Enter commit, and Esc cancel. Test: component test in `SketchOverlay.test.tsx`.
- [ ] 1.3 Connect HUD commitments to `toolStateMachine.ts` so submitted values create points, circles, and driving dimension constraints. Test: unit test in `toolStateMachine.test.ts`.

## 2. Direct Face Selection for New Sketch

- [ ] 2.1 Add plane/face picker state in `EditorMode.tsx` when clicking "New Sketch" without requiring Face selection mode. Test: interaction test in `EditorMode.test.tsx`.
- [ ] 2.2 Highlight planar face under cursor in the viewport during plane picking. Verification: visual check in browser on a 3D box.
- [ ] 2.3 Store `hostObjectId` and `faceId` in `Sketch` definition and re-resolve frame when the host body is updated. Test: unit test in `sketch/plane.test.ts`.

## 3. Sequential Modeling Workflow (Sketch ➔ Extrude)

- [ ] 3.1 Display contextual `Extrude` action upon finishing a sketch with closed profiles. Verification: visual check in browser.
- [ ] 3.2 Pre-populate `FeatureDialog` with `hostObjectId` and directional `Join` / `Cut` default operation based on extrude sign. Test: component test in `FeatureDialog.test.tsx`.
- [ ] 3.3 End-to-end test of sequential modeling: create box ➔ sketch circle on top face with typed center and diameter ➔ extrude join 10 mm ➔ sketch circle on top of new cylinder ➔ extrude cut 5 mm. Verify closed manifold and volume. Test: `src/features/editor/sequentialModeling.test.ts`.

## 4. Version

- [ ] 4.1 Bump `package.json` to 1.17.0 and add `1.17.0 — 44c-editor-sketch-input-face` to `CHANGELOG.md`. Test: `npx vitest run src/site.test.ts`.

## 5. Verification

- [ ] 5.1 Run `npm test` and `npm run build` to ensure clean build.
- [ ] 5.2 Browser verification in EN and RU: draw circle with typed coordinates and diameter, create sketch directly on a face, and execute join/cut extrusions.
