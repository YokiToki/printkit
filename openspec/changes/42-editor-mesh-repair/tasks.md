# Tasks

## 1. Spike

- [ ] 1.1 Level set: check `Manifold.levelSet` in the installed `manifold-3d`; prototype Make Solid on a broken mesh (holes, flipped, self-intersecting) with winding-number sampling at three resolutions; record time, memory and output validity; set the memory budget and the default resolution in `design.md` Decision 3. If it cannot produce valid solids, stop for `/opsx:update`.
- [ ] 1.2 Decimate: check `simplify` behaviour on a 200k-triangle sphere and a bracket; record deviation vs tolerance and the bisection count (Decision 4).

## 2. Analysis (React-free, `src/geometry/mesh/`)

- [ ] 2.1 `analyze.ts`: edge map, open edges and boundary loops, non-manifold, degenerate, duplicates, orientation, shells with volumes, area and volume. Fixtures: closed cube, cube minus one triangle, two cubes, flipped cube, duplicated vertices, non-manifold edge. Test each count.
- [ ] 2.2 `intersections.ts`: grid broad phase and triangle–triangle test, pair cap, progress and abort callbacks. Test: two interpenetrating cubes, touching cubes (no report), cap message, abort.
- [ ] 2.3 `planarRegion.ts` (shared with `44`): connected flat region from a triangle with tolerance. Test: box faces, a cylinder side is not flat, tolerance behaviour.

## 3. Repairs

- [ ] 3.1 `weld.ts`, `removeDegenerate.ts`, `orient.ts`, `shells.ts` with reports. Test: each with counts, the weld tolerance, flipped shell only, small shells kept/removed by thresholds.
- [ ] 3.2 `fillHoles.ts` (flat with ear clipping and fan fallback, smooth with relaxation, size limit, skipped list). Test: triangle hole, square hole, a ring-shaped open end, a skipped loop; result closed and volume within tolerance.
- [ ] 3.3 `makeSolid.ts` per the spike with the memory estimate. Test: broken fixtures become valid Manifold input, volume within tolerance, refusal over budget.
- [ ] 3.4 `autoRepair.ts` and `report` text keys. Test: the typical broken fixture end to end, unrepairable case listing leftovers.
- [ ] 3.5 `decimate.ts` and `smooth.ts`. Test: triangle counts and deviation bounds, volume change under 1 % for smooth, boundary and sharp edges fixed, open mesh refused.
- [ ] 3.6 `orientation.ts`: `layOnFace`, `bestOrientations` with the scoring. Test: a tilted block gets the flat side down, the scores order axis-aligned flips of an L-shaped part as expected.

## 4. Worker and plumbing

- [ ] 4.1 `mesh.worker.ts` + `MeshClient` (lanes, cancel, progress to the jobs of `31a`, transfer of buffers). Test with the inline fallback like `PhotoClient`: latest wins, cancel, progress.
- [ ] 4.2 Source swap: a repair stores the new mesh (content hash), sets `source.meshId` and `originMeshId`, undo restores; garbage collection keeps referenced ids. Test: undo/redo, revert after reload, GC.
- [ ] 4.3 Tune the best-orientation weights on three reference models and record them in `design.md`.

## 5. UI (no artboard exists: built from `ui/` components and tokens)

- [ ] 5.1 "Mesh" section in Properties: health summary and details lists with Show (highlight sets and camera framing in `Viewport`), repair buttons with options dialogs, Auto repair report, Make Solid confirmation with the estimate, Decimate and Smooth forms, Revert. Component tests for each action and the messages; stepper assertion.
- [ ] 5.2 Measure tool: picking with snapping (add `three-mesh-bvh` if picking exceeds 50 ms on a 500k mesh), measurement list, copy, unit display, overlay lines and labels. Test the snapping and math helpers (distance, angle, circle fit, thickness) and the list component.
- [ ] 5.3 Analysis panel: overhang and thin-wall maps (vertex colours), open-edge and flipped highlights, section slider with clipping planes. Test the colour ramp and thresholds as pure functions; browser check on a tilted part and a hollow part.
- [ ] 5.4 The "not a closed solid" messages of `41` get a Repair action; strings in en and ru including `mesh.*`, `log.editor.mesh.*`. Test: key parity and the action opens the Mesh section.

## 6. Version

- [ ] 6.1 Bump `package.json` to 1.13.0 and add `1.13.0 — 42-editor-mesh-repair` to `CHANGELOG.md`. Test: `site.test.ts`.

## 7. Verification

- [ ] 7.1 `npm test` and `npm run build` are green, the dev server starts, no console errors; earlier editor features unchanged.
- [ ] 7.2 In the browser, en and ru: import three real broken STLs, read the diagnosis, repair step by step and with Auto repair, Make Solid the worst one, use the repaired mesh in a Boolean, decimate and smooth, Lay on Face and Best orientation, measure a hole and a wall against known sizes, view the overhang and thin-wall maps and the section; check the 500k-triangle performance and cancellation; undo through all and revert to imported.
