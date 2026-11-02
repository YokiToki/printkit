# Tasks

## 1. Spikes

- [ ] 1.1 Minkowski: check `minkowskiSum`/`minkowskiDifference` in the installed `manifold-3d`; time and memory on a cube, a rounded bracket and a 200k-triangle STL with spheres of 16/24/48 segments; compare the circumscribed/inscribed guarantee against analytic values. Record limits (max triangles, sphere segments, fallback message) in `design.md` Decision 10. If Offset/Hollow cannot be done within reasonable limits, stop for `/opsx:update`.
- [ ] 1.2 Cache: prototype the per-prefix LRU in a worker test (live-manifold counting, `delete()` on eviction), measure a 5-op stack edit; record in `design.md`.

## 2. Stack model (React-free, `src/editor/`)

- [ ] 2.1 `stack.ts`: `Op` types and params normalisation, `emptyStack`, add/remove/move/enable/rollback reducers, op summaries as keys. Test: reducers, normalisation of corrupt params, rollback bounds.
- [ ] 2.2 Graph: `buildGraph`, topological order, cycle detection with the cycle path, dependants of an object. Test: chains, diamonds, cycles named, deleted tool detection.
- [ ] 2.3 `migrateStack` in `migrateScene`: `feature` sources of `40` → empty source + ops, unknown kinds preserved disabled, idempotent. Test with stored scenes from `40` fixtures and unknown kinds.

## 3. Geometry operations (`geometry/features/ops/`)

- [ ] 3.1 `boolean.ts` (union/subtract/intersect, closed-solid guard with health info, tool placed by relative matrix) and Combine reducer. Test with `expectValidSolid`: volumes of box − cylinder, intersect, rotated target, open tool refused with counts.
- [ ] 3.2 `mirror.ts` and `pattern.ts` (linear with spacing/total/symmetric, circular with angle, merge or disjoint, triangle limit). Test: half-to-full volume, 4×20 mm bbox and volume, 6 pegs 60° apart, hole array volume, limit error.
- [ ] 3.3 `offset.ts` and `hollow.ts` per the spike (circumscribed/inscribed sphere, drains). Test: grown cube bbox, shrunk cube, shrink to empty error, hollow cube volume and drain connectivity (genus), wall too thick message value.
- [ ] 3.4 `evaluate.ts` generalised: fold over ops, rollback, failed ops with reason, tool evaluation in the target frame, prefix cache with LRU and `delete()`. Test: cache hits on repeated evaluation, edit of op *k* recomputes only *k…n* (counting calls), eviction frees manifolds, failed op keeps previous solid, missing tool.
- [ ] 3.5 `generate('editor')` takes the whole graph (objects, matrices, stacks), evaluates visible objects and tools, returns meshes per object plus per-op status (`ok`/`failed`+reason) in `ModelResult`. Test: result statuses, tools not returned as parts unless visible, stale cache after an edit.

## 4. UI (no artboard exists: built from `ui/` components and tokens)

- [ ] 4.1 Stack section in Properties: rows with drag handle, eye, summary, failed mark, rollback marker, Add menu, per-op forms (`LengthField` / `NumberField`, axis and plane selectors), Flatten with confirmation. Component tests for add, edit, reorder (keyboard and pointer), suppress, delete, rollback, flatten; `stepperAssert` passes.
- [ ] 4.2 Combine command (menu and context menu) and Release tool; outliner chips (ops count, tool of); ghost drawing of visible tools in `Viewport` with the existing tool colour tokens; export skips tool objects unless selected. Tests: Combine builds the op, release restores, export set, outliner chips.
- [ ] 4.3 Messages for `stack.error.*` (notSolid, cycle, toolMissing, wallTooThick, tooMany, offsetEmpty) as keys with parameters; log entries per failed op. Test: key parity en/ru and message parameters.
- [ ] 4.4 History: all stack commands through `dispatch` with merge for typing and one step per reorder. Test: undo/redo each command, merge, redo cleared.

## 5. Version

- [ ] 5.1 Bump `package.json` to 1.12.0 and add `1.12.0 — 41-editor-op-stack` to `CHANGELOG.md`. Test: `site.test.ts`.

## 6. Verification

- [ ] 6.1 `npm test` and `npm run build` are green, the dev server starts, no console errors; scenes of `39` and `40` load and look the same.
- [ ] 6.2 In the browser, en and ru, desktop and 390 px: subtract a patterned cylinder from a plate, move the tool and watch the holes move, mirror a half bracket, hollow an imported STL with drains, grow a part by 0.2 mm, reorder and suppress operations, roll back, flatten and undo, force a cycle and an open-mesh tool and read the messages; export and check the bbox/volume against the numbers.
