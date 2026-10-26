# Design

## Context

The app is a set of parametric modes: each mode owns a small serialisable parameter object, the worker turns it into a `ModelResult` (parts of typed arrays), `Viewport` draws it, `export/` saves it. An editor differs in three ways: the document is a list of many independent things, the user changes it with direct manipulation (so interaction must not rebuild geometry), and every change must be undoable. The research behind the choices is in `openspec/EDITOR.md`.

## Goals / Non-Goals

**Goals**
- A usable minimal editor: import STL (several), add primitives, move / rotate / scale precisely and with the mouse, undo, export.
- Reuse `Viewport`, `export/`, `ui/`, stores, i18n, log and units without changing generator behaviour.
- A document model that later changes can extend (operation stack `41`, sketches `40`) without migration of what is stored here.

**Non-Goals**: anything listed as out of scope in the proposal; matching a particular CAD's keymap exactly.

## Decisions

1. **Document = objects with a source and a matrix.** `EditorObject = {id, name, visible, locked, color, source, transform}`. `source` is `{kind:'mesh', meshId, unit}` or `{kind:'primitive', shape, params}`. `transform` is `{position:[x,y,z], rotation:[rx,ry,rz] (degrees, intrinsic XYZ), scale:[sx,sy,sz]}`; the 4×4 matrix is derived (`matrixOf`). The later `stack` field (change `41`) and sketch sources (`40`) are added as optional fields, so stored scenes stay valid.
2. **Transforms never rebuild geometry.** The worker returns one `PartMesh` per object *without* its matrix; `Viewport` applies the matrices as group matrices (like the assembled view of `20`). Dragging with the gizmo changes only React state of the draft and commits one history step on release (the pattern of `TopView`). Matrices are applied to vertices only for export, volume of the selection and bounding boxes (`applyMatrix`).
3. **Meshes are immutable and addressed by id.** The id is a hash of the vertex and index data, so identical meshes are stored once and a later `.pkit` file (see `openspec/EDITOR.md`, zip with `scene.json` and `meshes/<id>.bin`) can be written from the store without conversion. Imported meshes go through `parseStl` → `repairMesh`-style *welding only* (`weld`) → `IndexedMesh`, are stored in IndexedDB through the existing `meshStore` (memory fallback with the `persistent` flag) and registered in the worker with `ModelClient.registerMesh`. History therefore stores only ids and parameters. Unlike Cutout, a mesh that is not a closed solid is accepted; `health.ts` counts open edges, degenerate triangles, non-manifold edges and the sign of the volume, and the UI shows it. Orientation is not flipped on import (that is repair, `42`).
4. **Primitives are built in the worker** with `Manifold.cube / cylinder / sphere / extrude` and cached by `(shape, params)`; circle segments are fixed per primitive (96) so the result is deterministic. Parameters are mm and edited with `LengthField`; changing a parameter produces a new mesh for that object only.
5. **History = patches of the document.** A command is `{label, apply(doc) → doc, merge?}`; the stack stores `{label, before, after}` snapshots of the *document description* (objects array, small), not of meshes. Continuous edits (gizmo drag, typing in a field, a slider) merge into one step by a `mergeKey` within 800 ms. Selection is not part of history. Capacity 100.
6. **Viewport extension.** The component gets an optional `scene` prop `{matrices: Record<partLabel, Matrix4Tuple>, selection: string[], hover?, gizmo?: {mode, space, snap}, projection: 'persp'|'ortho'}` and callbacks `onPick(label | null, additive)`, `onBoxSelect(labels)`, `onGizmoChange(label[], matrices)` and `onGizmoCommit`. Without `scene` nothing changes. Picking uses a three.js raycaster against the part meshes (BVH only if profiling in 6.2 shows it is needed; the loop is per object bounding box first). The gizmo is three's `TransformControls` (MIT, in `three/examples/jsm`), attached to a pivot group; for several selected objects the pivot is the selection bbox centre. The selection outline uses an inverted-hull second pass drawn with the existing outline colour token. Existing `view`, `gap`, `showTools` props stay.
7. **ViewCube and projection.** A small DOM+CSS cube drawn over the view (not a three scene) shows the camera orientation and sets it by face / edge / corner click; orthographic uses `OrthographicCamera` created next to the perspective one and swapped, keeping target and distance (`viewCommands.ts`). The existing underside rules (`07a`) apply to both.
8. **Shell and layout.** `EditorMode` renders a grid: outliner (240 px), view (flex), properties (300 px). Panels are collapsible; below 768 px outliner and properties are bottom drawers like `Workspace`. The tool bar sits above the view: Import, Add (primitive menu), tool group (Select, Move, Rotate, Scale), snap toggle, view controls. No artboard exists for the editor; the screens are built from the component library and tokens, and the wireframe below is the reference to compare with.
9. **Hotkeys** through one `useHotkeys` registry (no hard-coded `keydown` in components), ignored when focus is in an input: `Del` delete, `Ctrl+D` duplicate, `Ctrl+Z` / `Ctrl+Shift+Z` or `Ctrl+Y`, `Ctrl+A`, `Esc`, `G`/`R`/`S` move / rotate / scale, `F` fit selection, `Shift+F` fit all, `1`/`3`/`7` front / right / top, `5` projection, `H` hide, `Alt+H` show all, `D` drop to bed. The hotkey list is shown in a popover from the tool bar.
10. **Export.** The export store and panel are reused. `editorParts(doc, meshes)` produces one `PartMesh` per exported object with the matrix applied and the label equal to the object name made unique (`Box`, `Box 2`); selected-only or all-visible is a toggle in the panel. Open meshes export as they are, with a warning in the log and in the panel.
11. **Placement rules on import.** Units: STL files have no unit; default mm, inch by the user's choice in the import dialog (remembered), and a note when the size is under 1 mm or over 1000 mm. The object is centred on XY and set to z = 0 (as `orientVertices` does for Cutout); several files are placed side by side with 10 mm gaps along X.
12. **Persistence.** `localStorage` key `editor.scene` (the document, versioned with `schema: 1`, normalised by `migrateScene`) and `editor.ui` (panel states, snap settings, projection). Meshes are removed from the store when no object (and no history entry) refers to them any more, at load time.

## Wireframe (reference for the browser comparison)

```
┌ Header: [PrintKit] [Editor ▾] ................ mm/in  EN/RU  Log  ┐
├ Toolbar: Import  Add▾ │ Select Move Rotate Scale │ Snap▾ │ Persp▾ Fit ┤
├ Outliner ───────┬ View ───────────────────────────┬ Properties ───────┤
│ ▢ Bracket.stl   │            ViewCube              │ Name              │
│ ▢ Box           │      [3D scene + gizmo]          │ Position X Y Z    │
│ ▢ Cylinder      │                                  │ Rotation X Y Z    │
│  eye lock …     │  status bar / measurements       │ Size  X Y Z 🔒    │
│                 │                                  │ Source (params)   │
│                 │                                  │ Mesh health       │
│                 │                                  │ Export panel      │
└─────────────────┴──────────────────────────────────┴───────────────────┘
```

## Risks / Trade-offs

- **Matrix as group transform vs. true geometry.** Fast and simple now; later boolean operations (`41`) must first bake the matrix in the worker. That is why `applyMatrix` and the worker input already carry the matrices (`generate('editor')` receives `{objects, matrices}` but ignores them in this change).
- **Picking large meshes.** Raycasting 1M triangles per mouse move is too slow. Hover picking is limited to bounding boxes first and to a throttled raycast on click; a BVH (`three-mesh-bvh`, MIT) is added only if 6.2 measures a problem, as a task of this change.
- **Open meshes.** Accepting them means every later operation needs a guard. `health.ts` exposes `isSolid(mesh)` for that; this change only displays it.
- **TransformControls look and feel.** The component is mouse-oriented; touch works but is coarse. Accepted for v1; numeric fields are the precise path.
- **History memory.** Snapshots of the description are small; primitives and imported mesh ids are references. Deleting an object keeps its mesh until history is cleared.

## Open Questions

- Whether the intrinsic XYZ Euler order is the least surprising for the numeric fields (Blender uses XYZ; Fusion shows axis-angle). Chosen: XYZ, revisited in 6.2.
- Whether the start page shows the Editor as a wide hero card above the three generator cards or as the first of four equal cards. Decided during task 5.2 by comparing at 390 px and desktop.
