# Design

## Context

`39` stores objects `{source, transform}`; `40` adds sketch-built bodies with a feature list. Rule 2a (`openspec/EDITOR.md`): descriptions are the source, meshes are derived. A single mechanism must now cover sketch features, booleans with other objects and body operations. Blender's modifier stack and Fusion's timeline are the references; Blender's *order matters, non-destructive, apply when done* model is the simplest to explain and implement.

## Goals / Non-Goals

**Goals**: one stack model for everything; fast edits through caching; safe dependency handling; clear messages for open meshes and failures.
**Non-Goals**: parametric constraints between bodies, formulas, assembly joints, a separate timeline bar.

## Decisions

1. **Model.** `EditorObject = {…, source: Source, stack: Op[]}`; `Source` = `mesh | primitive | empty` (an empty source is a sketch-built body whose first op is Extrude/Revolve with `op: 'new'`). `Op = {id, kind, params, enabled, label?}` with kinds: `extrude`, `revolve` (from `40`), `boolean`, `mirror`, `linearPattern`, `circularPattern`, `offset`, `hollow`. Later changes add `planeCut`, `hole`, `text` (43), `pushPull`, `edgeBreak` (44), `decimate`, `smooth` (42, as ops on a mesh source).
2. **Evaluation.** `evaluateObject(obj, ctx)` folds the enabled ops over the source result. Each op is a pure function `(solid | null, op, ctx) → solid` where `ctx` gives sketches, other objects' evaluated results (for tools), the quality and the abort signal. A failed op returns `{solid: previous, failed: {index, reason}}` and evaluation stops for that object (as in `40`). The rollback marker is `obj.rollback` (index or `null`); ops after it are not evaluated and the result is the state at that step.
3. **Cache.** Key of step *k* = hash of `(source id/params, ops[0..k] params + enabled, ids and versions of tools used up to k, quality)`. The worker keeps a map from key to `Manifold` with an LRU bound by triangle count (default 6 M) and deletes evicted manifolds (`.delete()`); editing op *k* reuses result *k−1*. Only the final solid of each visible object is turned into a mesh and sent; intermediate solids never leave the worker.
4. **Graph.** A `boolean` op references tool objects by id. `buildGraph(objects)` gives dependencies; evaluation order is a topological order; a cycle is detected when the op is created or edited and refused with the cycle named (`stack.error.cycle`). The tool is evaluated *with its own stack and its own transform*, then brought into the target's local space by `inverse(targetMatrix) · toolMatrix` (the worker receives matrices for this reason; `39` already carries them). Deleting a tool object marks the dependent ops failed (reason `toolMissing`); undo restores both.
5. **Closed-solid guard.** Booleans, offset and hollow need valid Manifold input. The source/tool mesh is converted with `toManifold`; on failure the op fails with `stack.error.notSolid` naming the object and the health summary of `39` (`openEdges`, …), with an action link to repair once `42` exists (until then the message is plain).
6. **Combine command.** For objects A, B, C selected with A active: Union → A gets `boolean(union, [B, C])`; Subtract → `boolean(subtract, [B, C])`; Intersect likewise. B and C become tools: hidden by default, `toolOf` shown in the outliner. This is one history step. The reverse (Release tool) removes the op and shows the tool again.
7. **Tools in the view and export.** An object that is a tool of an enabled op is a *tool object*: if visible it is drawn as a ghost (translucent, the existing tool colour tokens, no outline pick priority), otherwise hidden. Export skips tool objects unless they are explicitly selected with "Selection only". The 3D measurements bar uses the result bodies only.
8. **Mirror.** `mirror {plane: 'XY'|'YZ'|'XZ' (object local), origin: 'object'|'bbox'|number, merge}`: `merge` unions the body with its mirror image (default), otherwise both shells are kept in one solid (disjoint union); Manifold's `mirror(normal)` plus a translation.
9. **Patterns.** `linearPattern {axis, count (2–200), spacing | total, symmetric, merge}` and `circularPattern {axis, count, angle (full or partial), merge}` copy the body so far with Manifold transforms; `merge` unions, otherwise disjoint union (with an overlap warning). Axis: `x|y|z` of the object, a sketch line (plane frame), or two points later. Counts above a limit (triangles × count > 6 M) are refused. Pattern of the body is the only mode; patterns of a single earlier feature are out of scope, and hole arrays are done by patterning the *tool* object and subtracting it.
10. **Offset and Hollow.** `offset {distance}` (positive grows, negative shrinks) and `hollow {wall, drains: [{point, normal, diameter}] }`. Manifold Minkowski operations with a sphere approximation: the sphere is built as a polyhedron whose *circumscribed* radius is the requested distance for the minimum wall guarantee (shrink) and *inscribed* for the maximum size guarantee (grow), segment count from the tolerance (16–48). Hollow = `body − offset(body, −wall)` with drains as cylinders from the cavity to the outside along the given normal; a body that cannot hold a cavity of that wall (empty offset) fails with `stack.error.wallTooThick`. The spike (1.1) measures Minkowski time and robustness on real meshes; the limit on triangles and the fallback message are set from its results.
11. **Apply and Flatten.** *Apply* replaces ops[0..k] with the baked mesh as a new `mesh` source only if k is the first op; applying an op in the middle is not allowed (the UI offers Flatten). *Flatten* evaluates the stack, stores the mesh as a new immutable mesh (content hash) and resets the source to `mesh` with an empty stack; keeps an undo step. Flatten is the bridge to destructive mesh edits of `42`, which operate on mesh sources.
12. **Migration.** `migrateScene` turns `source: {kind:'feature', features}` of `40` into `source: {kind:'empty'}` with `stack: features.map(toOp)`; unknown op kinds are kept but disabled and shown as "unknown operation" so newer files do not lose data.
13. **UI.** The properties panel of an object shows a "Stack" section: a list of rows (drag handle, eye, kind icon, summary, failed mark) with rollback marker between rows, an Add menu (Boolean, Mirror, Pattern, Offset, Hollow, Extrude, Revolve), edit-in-place forms per op using `LengthField`/`NumberField`, and Flatten. The outliner shows chips for the number of ops and the tool relation. No artboard exists: built from `ui/` components and tokens.
14. **History.** Stack edits go through `dispatch(label, patch, mergeKey)`; drag reordering is one step; typing merges.

## Risks / Trade-offs

- **Minkowski cost.** Offsetting a non-convex 500k-triangle mesh with a sphere may take many seconds or memory. Mitigations: triangle limit with a message, progress/abort in the log, coarse sphere in the preview, cached result. The spike decides the limits.
- **Cache memory.** Many cached solids on large meshes; LRU by triangles plus explicit `delete()`; tested for leaks (counting live manifolds).
- **Order sensitivity.** Reordering ops can make later ones fail; the UI shows the failed row and keeps the state valid instead of blocking.
- **Floating point.** Booleans of nearly coplanar faces produce slivers; tools are not auto-grown (a user-facing "overlap" is the user's choice), and the Offset op exists to adjust.
- **Scope creep toward a full CAD timeline.** Parameters, formulas and groups are left out deliberately.

## Open Questions

- Spike 1.1: Minkowski limits and sphere resolution.
- Whether Mirror should default to `merge` for symmetric printing parts (assumed yes).
- Whether the rollback marker should also pause the display of dependent objects (assumed no: dependants see the full result).
