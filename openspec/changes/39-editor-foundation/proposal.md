# Proposal

## Why

PrintKit so far is a set of generators: the user fills in fields and gets a Gridfinity part, a keychain or a rack part. That covers the standard cases, but the everyday work of preparing parts for printing is different: take a downloaded STL, look at it, move, scale and combine it with other shapes, add a few primitives, and export. Desktop tools (Tinkercad, Fusion 360, Blender, Meshmixer, slicer tools) are built around this loop. A free editor is the missing core, and the generators become secondary tools next to it.

The research and the plan of the whole series (`39`–`45`) are in `openspec/EDITOR.md`. This first change builds the **foundation** that every later editor feature stands on: the product shell, the scene document, STL import, primitives, selection, transforms, undo/redo and export. It does not yet contain sketches, boolean operations or mesh repair; those are `40`–`44`.

The 3D view already exists and is reused. Everything around it (panels, toolbar, document model, history) is new, because the generator `Workspace` is a parameter panel for one part, not an editor of many.

## What Changes

- **New product "Editor"** at `/editor`, first in the product list and shown as the large main card on the start page; Gridfinity, Keychain and Rack keep their routes and storage keys unchanged and are presented as "Generators". The Header product switcher gets the Editor entry. `/` still opens the product chooser (making the editor the default entry is `45`).
- **Editor shell** (new, not `Workspace`): outliner on the left, properties on the right, a tool bar above the view, the existing status bar and measurements below; below 768 px the panels become drawers.
- **Scene document**: a list of objects `{id, name, visible, locked, color, transform}` with a source: an imported mesh or a primitive. Transforms are a matrix on the object, so moving does not rebuild geometry.
- **STL import**: file dialog and drag-and-drop on the view, several files at once, binary and ASCII, unit choice (mm / inch), automatic placement on the bed. The mesh is accepted even if it is not a closed solid; a health summary (closed, holes, degenerate faces, flipped) is shown in the properties and the object is flagged when it is open. Meshes live in IndexedDB.
- **Primitives**: box, cylinder, sphere, cone, torus, wedge, with parameters in mm (`LengthField`), editable after creation.
- **Selection**: click, Shift/Ctrl add, box select, select from the outliner, Esc, Select all; selected objects get an outline in the view.
- **Transform tools**: move / rotate / scale gizmo (Move `G`/`W`, Rotate `R`/`E`, Scale `S`/`R`), numeric position / rotation / size in the properties, snapping (grid step, angle step), Drop to bed, Center on bed, Reset transform, Duplicate, Delete, Mirror along an axis, Scale to a target size with proportion lock.
- **Undo / Redo** for all document changes (history of 100 steps, `Ctrl+Z` / `Ctrl+Shift+Z`), with the step name shown in the status bar.
- **View controls**: ViewCube with standard views, perspective / orthographic switch, Fit all, Fit selection, section-free "isolate" (hide others). The ground grid and underside camera of `07a` stay.
- **Export of the scene**: all visible objects, or the selection, through the existing export panel (STL, 3MF, printers, plate arrangement); each object is one part, with its matrix applied.
- **Persistence**: the document description in `localStorage` (`editor.scene`), meshes in IndexedDB; reloading restores the scene; a missing mesh shows a placeholder and an error in the log.
- **Viewport extension** (without changing generator behaviour): optional `scene` mode with per-part matrices, picking, selection outline, gizmo attachment, camera projection and view commands.
- **Activity log**: import, repair-free health report, history and export write to the log of `31a`.

## Capabilities

### New Capabilities
- `editor-workspace`: product, routes, shell, panels, view controls, persistence of the document.
- `editor-objects`: scene objects, STL import, primitives, outliner, properties, mesh health.
- `editor-transform`: selection, gizmo, numeric transforms, snapping, drop to bed, mirror, scale to size.
- `editor-history`: undo / redo of document changes.

### Modified Capabilities

## Impact

- New `src/editor/` (React-free: `scene.ts` document types and reducers, `commands.ts` and `history.ts`, `transform.ts` matrix maths and snapping, `primitives.ts` descriptors, `health.ts` mesh analysis, `sceneStore.ts` persistence) and `src/features/editor/` (`EditorMode`, `Outliner`, `Properties`, `Toolbar`, `ViewCube`, `useSelection`, `useScene`, hotkeys). `geometry/model.ts` gets `ModeParams.editor` and `generate('editor')` (builds primitive meshes, returns parts without the object matrices; meshes are registered in the worker by id through the existing `meshRegistry`). `Viewport.tsx` gets the optional scene API; `products.ts`, `routes.tsx`, `StartPage`, `Header` get the product; strings in en and ru; tests.
- `export/` takes parts with a matrix applied up front (`applyMatrix` in `geometry/mesh.ts`); the export panel, printers and arrangement are unchanged.
- Existing generator modes, their routes, storage keys and geometry are not touched.
- Out of scope: sketches, constraints, extrude / revolve (`40`); boolean operations, operation stack, patterns, hollow (`41`); mesh repair, decimate, smooth, measurements beyond the bounding box (`42`); plane cut, split and connectors (`43`); face and edge selection, fillet, push/pull (`44`); project files in the `.pkit` format (`45`; this change only stores the document in a shape that becomes a `.pkit` without conversion), making the editor the default entry (`45`); STEP / B-rep; sculpting; multi-user.
- Version 1.10.0 (minor: a new product).
- Depends on: `29-beta-label` (versioning rule), `31a-status-log` (log and status bar). The generators from `32`–`38` are independent of this change.
