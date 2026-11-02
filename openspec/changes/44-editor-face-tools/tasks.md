# Tasks

## 1. Spike

- [ ] 1.1 Fillet tools: build the prism/revolve tools for a chamfer and a fillet on a box edge, a cylinder rim and a rounded-rectangle outline with a corner; check validity with `expectValidSolid`, volumes against the formulas, corner behaviour with three edges meeting; record tolerances, segment counts and visible defects in `design.md` Decision 5. If corners are unacceptable, restrict to isolated chains and say so in the proposal via `/opsx:update`.
- [ ] 1.2 Segmentation: time flat-region and feature-edge recognition on a 500k-triangle mesh in a worker; set the triangle limit and the default thresholds (Decisions 1, 2, 8).

## 2. Topology (React-free, `src/geometry/topology/`)

- [ ] 2.1 `faces.ts`: adjacency, flat regions, smooth patches, whole-mesh segmentation with region ids per triangle, primitive classification (plane, cylinder, cone, sphere) with residuals; builds on `planarRegion` of `42`. Test: box (6 regions), cylinder (3), sphere (1 smooth), L-bracket, tolerance behaviour.
- [ ] 2.2 `edges.ts`: feature edges by dihedral threshold, chains through degree-2 vertices, line/circle/free classification, convex/concave sign. Test: box (12 lines), cylinder (2 circles + seam handled), rounded rectangle outline (lines and arcs), noisy edge not classified as circle.
- [ ] 2.3 `reference.ts`: `FaceRef`/`EdgeRef` creation and `resolveFace`/`resolveEdge` with tolerance scaling and `ambiguous`/`missing` results. Test: resolution after a small scale of the source, after a pushed neighbouring face, ambiguous parallel faces, missing after deletion.
- [ ] 2.4 Tune the thresholds (30° dihedral, 1° coplanar) on five reference models and record them in `design.md`.

## 3. Operations (`geometry/features/ops/`)

- [ ] 3.1 `pushPull.ts` for planar regions with holes, several coplanar faces, clamped negative distances, refusal of non-planar. Test with `expectValidSolid`: the cube scenarios of the spec, plate with hole, clamp message value.
- [ ] 3.2 `edgeBreak3d.ts` chamfer and fillet for lines, circles and mixed chains, mitre joins at shared corners, limits (size, dihedral) with message values. Test: volumes of the spec scenarios, all-four-top-edges cube valid and closed, hole rim, concave corner, too-large radius message.
- [ ] 3.3 Register `pushPull` and `edgeBreak` in the stack (normalisation, summaries, failed reasons `face.error.*`, `edge.error.*`). Test: round trip through `migrateScene`, failed reference blocks later ops, editing size keeps refs.
- [ ] 3.4 Face-based sketch plane: `{face, frame}` kind in `editor/sketch/plane.ts`, frame rule (longest straight edge, fallback axes), detached state, re-resolution; projection of loops and chains into sketch geometry. Test: frame for box faces, detached behaviour, projected circle and lines with coincident endpoints.

## 4. Worker and viewport

- [ ] 4.1 `topology` computed in the worker with progress jobs and cache by mesh hash; client API `topologyOf(meshId)`. Test with the inline fallback: caching, progress, limit message.
- [ ] 4.2 Viewport: face/edge highlight layers (per-triangle colours on an overlay mesh, edge polylines), hover and selection, edge picking by screen distance, pointer modes; Object mode unchanged. Test the pure picking helpers and the colour mapping; browser check with hover on a box, cylinder and an imported STL.

## 5. UI (no artboard exists: built from `ui/` components and tokens)

- [ ] 5.1 Mode switch in the tool bar and hotkeys, status line (faces/edges selected, area, length, kind), sharpness threshold control, limit message. Component tests.
- [ ] 5.2 `PushPullTool` (drag handle along the normal with snapping, typed distance with `LengthField`, preview), `EdgeBreakTool` (chamfer/fillet toggle, size field, preview, error messages), Sketch on face and Project edges commands in the context menu. Component tests and a browser check.
- [ ] 5.3 Stack rows for the new operations with re-pick actions on failure; strings in `en.json` and `ru.json` (`face.*`, `edge.*`, `topology.*`, log keys); key parity.

## 6. Version

- [ ] 6.1 Bump `package.json` to 1.15.0 and add `1.15.0 — 44-editor-face-tools` to `CHANGELOG.md`. Test: `site.test.ts`.

## 7. Verification

- [ ] 7.1 `npm test` and `npm run build` are green, the dev server starts, no console errors; earlier editor features unchanged.
- [ ] 7.2 In the browser, en and ru, desktop and 390 px: on an imported bracket STL push a wall out, push a pocket in, fillet the outer edges and a hole rim, chamfer an inner edge, sketch on its top face with projected outline and cut a slot, change an earlier dimension and see the references hold or fail clearly, undo through all, export and check bbox and volumes.
