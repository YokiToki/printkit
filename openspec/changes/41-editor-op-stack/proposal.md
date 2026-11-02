# Proposal

## Why

After `40` a body built from sketches keeps a short list of features, and `39` objects are independent of each other. Real parts need operations *between* bodies and *on* bodies: subtract a hole pattern, add a boss, mirror a half, hollow a model to save resin or filament, grow a part by 0.2 mm for clearance. Desktop tools solve this with a non-destructive history (Fusion's timeline, Blender's modifier stack) where each operation stays editable. `openspec/EDITOR.md` (section 2) fixes the model: objects with a source and a stack of operations evaluated in the worker. This change turns the feature list of `40` into that general stack and adds the first body operations.

## What Changes

- **Operation stack.** Every object gets an ordered `stack` of operations applied to its source (imported mesh, primitive, or a sketch-built base). Each operation can be edited, reordered by drag, suppressed (eye), deleted, applied (baked into the result) or the whole stack flattened. A rollback marker shows the object as it was after a chosen step. The sketch features Extrude and Revolve of `40` become stack operations; stored scenes of `40` are migrated automatically.
- **Booleans between objects.** Union, Subtract and Intersect with one or more *tool* objects, in the target's local space. Tools stay in the scene (hidden or shown as translucent ghosts) and keep their own transform and stack, so moving the tool moves the cut. A **Combine** command (select several objects → Union / Subtract / Intersect) creates the operation in one step. Requires closed solids; open meshes are refused with the reason and a pointer to repair (`42`).
- **Mirror** (about a plane through the object origin, a bounding-box centre plane or a plane along an axis; merged or kept as separate shells).
- **Linear and circular patterns** of the body so far, with count, spacing or total length, axis from a world axis, a sketch line or the object origin. A pattern on a *tool* object followed by a Subtract gives hole arrays.
- **Offset** (grow or shrink by a distance) for clearances and wall changes, and **Hollow** (shell with a wall thickness and optional drain holes), both built with Minkowski offsets of Manifold.
- **Dependency graph.** Objects can depend on other objects as tools; cycles are refused; a deleted tool turns the operation into a failed one without losing the rest; the worker evaluates the graph in order with a per-prefix cache so editing step *k* recomputes only steps *k…n*.
- **Display of tools and export.** Objects used as tools are drawn as ghosts when visible, are not exported unless selected explicitly, and the outliner shows the relation (tool icon, "used by").

## Capabilities

### New Capabilities
- `editor-op-stack`: stack model, editing, reordering, suppression, rollback, apply and flatten, migration of `40` features, dependency graph and evaluation.
- `editor-booleans`: Union, Subtract, Intersect, Combine, tools and ghosts.
- `editor-body-ops`: Mirror, patterns, Offset, Hollow.

### Modified Capabilities

## Impact

- `src/editor/stack.ts` (types, validation, dependency graph, migration `migrateStack`), `geometry/features/ops/{boolean,mirror,pattern,offset,hollow}.ts`, `geometry/features/evaluate.ts` generalised (prefix cache, graph order), `geometry/model.ts` (`generate('editor')` takes the whole graph), outliner and properties get the stack panel (`features/editor/stack/*`), tool ghosts in `Viewport` (existing tool colour tokens), strings in en and ru, tests.
- Scenes saved by `39`/`40` load unchanged; `source: {kind:'feature'}` is rewritten to an empty source plus stack entries by `migrateScene`.
- Out of scope: plane cut, split, connectors, holes, text on faces (`43`); face and edge based operations, fillet and chamfer of body edges, push/pull (`44`); mesh repair, decimate, smooth (`42`); project files (`45`); parameters with formulas; suppress by group/configuration; feature patterns of a single earlier operation (only whole-body patterns and tool patterns); true timeline UI as a separate bottom bar (the stack panel with a rollback marker covers it).
- Version 1.12.0 (minor: a new capability).
- Depends on: `40-editor-sketch`.
