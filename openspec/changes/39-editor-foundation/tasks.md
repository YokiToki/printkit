# Tasks

## 1. Document core (React-free, `src/editor/`)

- [ ] 1.1 `scene.ts`: types (`EditorObject`, `Transform`, sources `mesh` | `primitive`, `SceneDoc {schema: 1, objects}`), `matrixOf(transform)`, `newName` (unique "Box", "Box 2"), reducers (add, remove, update, duplicate, reorder). Test: matrix of identity / translate / rotate / scale, composition order, unique names, duplicate shares the mesh id.
- [ ] 1.2 `transform.ts`: `boundsOf(object)`, `selectionBounds`, `dropToBed`, `centerOnBed`, `mirror` (with winding flag), `scaleToSize` (proportion lock, keeps centre), `snapValue`, `snapAngle`, `rotateAbout(pivot)`. Test: each against a known box, mirror twice is identity, snap steps.
- [ ] 1.3 `history.ts`: `History<T>` with `push(label, before, after, mergeKey?)`, `undo`, `redo`, merge window 800 ms, capacity 100, `clear`. Test: undo/redo order, discard of redo after a new push, merge of continuous edits, capacity.
- [ ] 1.4 `health.ts`: `meshHealth(mesh)` → `{triangles, openEdges, nonManifoldEdges, degenerate, volume, closed}` and `isSolid`. Test with fixtures from `geometry/stl-fixtures.ts`: closed cube, cube with a missing triangle, flipped cube (negative volume), degenerate triangle.
- [ ] 1.5 `geometry/mesh.ts`: `applyMatrix(mesh, m)` (positions, winding corrected when the determinant is negative) and `meshBounds`. Test: translation, rotation 90°, mirror winding, bbox and volume preserved by rigid transforms.
- [ ] 1.6 `sceneStore.ts`: `useScene` persistence with `usePersistedState`-style key `editor.scene`, `migrateScene` normalising every field (corrupt or partial data never crashes), mesh garbage collection at load. Test: round trip, corrupt JSON, unknown source kind dropped with a log entry, missing numbers get defaults.

## 2. Geometry and worker

- [ ] 2.1 `src/editor/primitives.ts`: descriptors for box, cylinder, sphere, cone, torus, wedge (parameters, defaults, limits as i18n keys, mm). `geometry/model.ts`: `ModeParams.editor = {objects: {id, source}[]}` and `generate('editor', params)` builds primitive meshes with Manifold (96 segments) and passes imported meshes through from `meshRegistry` without requiring a solid; returns one part per object labelled by id; cache by (shape, params). Test with `expectValidSolid` for every primitive (volume against the formula, bbox) and a pass-through of an open mesh.
- [ ] 2.2 Import pipeline `features/editor/importFiles.ts`: `parseStl` → weld only (no orientation flip) → `orientVertices`-style centring and drop to bed, unit choice, several files with 10 mm spacing, store in `meshStore`, register in the worker, log entries (names and sizes only). Test: binary and ASCII fixtures, inches, bad file does not stop the others, size notice thresholds.
- [ ] 2.3 `useEditorModel(doc)`: calls `useModel('editor', …)` with the descriptions only (no matrices), so a transform change never regenerates; returns parts keyed by object id. Test: moving an object does not start a model job, changing a primitive parameter rebuilds only that object.

## 3. Viewport extension

- [ ] 3.1 `Viewport` optional `scene` prop and `onPick` / `onBoxSelect` / `onGizmoChange` / `onGizmoCommit`: per-part matrices, raycast picking (bounding boxes first), locked parts not pickable, hidden parts not drawn. Existing props and behaviour unchanged. Test (three mocked in jsdom as for other viewport tests): matrices applied to groups, picking returns the front-most unlocked part, generator modes render as before.
- [ ] 3.2 Selection outline (inverted hull in the existing outline colour token) and `TransformControls` attached to a selection pivot, orbit disabled while dragging, snapping from the scene prop, commit on release. Browser check: all three tools on one and on three objects, orbit not disturbed.
- [ ] 3.3 Box select: drag on empty space draws a rectangle overlay (DOM), orbit stays on right/middle button and on Alt-drag. Test the pure rectangle ↔ bounds intersection helper in `features/editor/boxSelect.ts`.
- [ ] 3.4 `viewCommands.ts` and `ViewCube`: standard views, perspective ↔ orthographic (target and distance kept), Fit all, Fit selection; ground fade rules of `07a` apply to both cameras. Test the pure camera maths (view direction per face, ortho size from distance and fov); browser check of the cube in both languages.

## 4. Editor UI (no artboard exists: built from `ui/` components and `theme.css` tokens; compare with the wireframe in `design.md`)

- [ ] 4.1 `EditorMode` shell: grid with collapsible outliner and properties, tool bar, drawers below 768 px, status bar and measurements reused. Component test: panels collapse, drawer buttons exist at narrow width. Compare at 1280 px and 390 px in en and ru.
- [ ] 4.2 `Outliner`: rows with name (rename on double click), eye, lock, health flag, multi-select with Shift/Ctrl, context menu (Duplicate, Delete, Isolate, Show all). Component test for each action and for keyboard navigation.
- [ ] 4.3 `Properties`: name, colour, transform fields (`LengthField` for position and size, `NumberField` for degrees, proportion lock), source parameters per primitive, mesh health block, empty-selection summary; `stepperAssert` passes. Component test: typing a size applies on blur/Enter as one history step; multi-selection shows the common transform.
- [ ] 4.4 Tool bar: Import (file input with `multiple`, unit choice dialog remembered in `editor.ui`), Add menu, tool group, snap toggle with steps, projection switch, Fit, hotkeys popover; drop zone on the view with a visible hint. Component tests: import via input and via drop event, Add creates an object.
- [ ] 4.5 `useHotkeys` registry and the commands of design item 9, ignored in inputs; every command also has a button or menu entry. Test: each key runs its command, nothing runs while an input has focus, conflicts between registered keys throw.
- [ ] 4.6 Undo/redo wiring: all commands go through one `dispatch(label, patch, mergeKey?)`; buttons and status bar step name. Test: each command is undoable, merge of gizmo drag and typing, redo cleared on new change, delete+undo restores the mesh.

## 5. Product, routes, start page

- [ ] 5.1 `products.ts` (`editor` first, `Product.modes` none), `routes.tsx` (`/editor`, unknown subpaths go to `/editor`), `lastSession` stores the product (a record without it still reads as gridfinity), `Header` switcher and logo text, `AppShell` hides the generator mode switcher for the Editor. Test: routes, switcher lists four products, old session records.
- [ ] 5.2 Start page: the Editor as the main card (render of a small scene: a bracket mesh, a box and a cylinder with a gizmo, via the art script as a fifth group `editor.svg`, size budget as for the others), generator cards under a "Generators" heading; hotkeys 1–4. Test `ModeArt` budget and the start-page component test; compare at 390 px and desktop in en and ru (decides the Open Question in `design.md`).
- [ ] 5.3 Strings in `en.json` and `ru.json` for everything above, including `log.editor.*` keys (the key-parity test must pass). The README product list gets the Editor.

## 6. Export and log

- [ ] 6.1 `editorParts(doc, meshes, {selectionOnly})` applies the matrices (`applyMatrix`) and makes unique labels; the Editor's export footer reuses `ExportPanel` with the "Selection only" toggle, open-mesh and below-bed warnings. Test: exported bbox and volume of the selection equal the matrices applied by hand; open mesh gives a warning but exports; labels unique.
- [ ] 6.2 Log producers (`import`, `add`, `history`, `export` entries with names and sizes only) and a performance check: a 500k-triangle STL imports, orbits and picks without freezing (record numbers in the commit message; add a BVH task here only if picking takes more than 50 ms).

## 7. Version

- [ ] 7.1 Bump `package.json` to 1.10.0 and add `1.10.0 — 39-editor-foundation` at the top of `CHANGELOG.md`. Test: `site.test.ts` passes with the new number.

## 8. Verification

- [ ] 8.1 `npm test` and `npm run build` are green, the dev server starts, the console has no errors; the three generators open and work as before.
- [ ] 8.2 In the browser, en and ru, desktop and 390 px: import two real STL files (one with holes), add a box and a cylinder, move / rotate / scale with the gizmo and with numbers, snap, drop to bed, mirror, duplicate, hide, lock, undo/redo everything, reload and see the same scene, export STL and 3MF of all and of the selection and check the bounding box and volume in an external viewer or the measurements bar.
