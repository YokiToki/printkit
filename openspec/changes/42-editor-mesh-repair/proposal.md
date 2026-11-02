# Proposal

## Why

Most STL files found online are not clean: holes, flipped faces, duplicate vertices, tiny floating shells, self-intersections. They print badly or cannot be used in booleans (`41` refuses open meshes). Desktop tools (Meshmixer, 3D Builder, netfabb, slicer repair) exist largely for this. The foundation (`39`) already shows a health summary; this change adds the diagnosis in detail, the repairs, the mesh-reducing operations (Decimate, Smooth), the orientation helpers (Lay on Face, best orientation) and the measuring and analysis tools that every printing workflow uses (distance, angle, hole diameter, wall thickness, overhangs, cross-section view).

## What Changes

- **Detailed diagnosis** on a mesh object: open edges grouped into boundary loops (count, perimeter), non-manifold edges and vertices, degenerate and duplicate triangles, flipped triangles and inverted volume, disconnected shells (count, volumes), self-intersections (count and a progress/abort job), small shells under a threshold. Problems are listed with *Show* (highlighted in the view and framed).
- **Repairs** (each one undoable, each a new immutable mesh): Weld vertices (tolerance), Remove degenerate / duplicate triangles, Fix orientation (consistent winding, outward by volume), Fill holes (flat or smoothed fill, per loop or all, size limit), Remove small shells, Resolve self-intersections and **Make Solid** (remesh through a winding-number level set at a chosen resolution, as the last resort), and **Auto repair** (the sequence with a report and a before/after summary).
- **Decimate** (target triangle count or tolerance in mm, with before/after and a preview of the deviation) and **Smooth** (Taubin smoothing with strength and iterations, boundaries and sharp edges preserved).
- **Orientation:** **Lay on Face** (click a flat region, it goes to the bed), **Best orientation** (suggests up to three orientations scored by overhang area, height and contact area), Drop to bed is already in `39`.
- **Measure tool:** distance between two picked points (vertex, edge midpoint, face centre or free), angle between three points or two faces, circle fit (diameter of a hole or boss from three or more points), wall thickness at a point; results in a list in mm/in with copy. Measurements are session-only.
- **Analysis overlays:** overhang map for the current orientation (angle threshold, default 45°), thin-wall map below the nozzle-based threshold taken from the export settings, open-edge and flipped-face highlights, a **section view** (clipping plane along X/Y/Z with a slider).
- **Heavy work in a worker** (`mesh.worker.ts` with progress and cancel through the log jobs of `31a`), so the UI stays responsive on large meshes.

## Capabilities

### New Capabilities
- `editor-mesh-health`: diagnosis, listing, highlighting, shells and self-intersections.
- `editor-mesh-repair`: repairs, Make Solid, Auto repair, Decimate, Smooth, orientation helpers.
- `editor-measure-analysis`: measuring tool, overhang and thin-wall maps, section view.

### Modified Capabilities

## Impact

- New `src/geometry/mesh/{analyze,weld,orient,fillHoles,shells,intersections,makeSolid,decimate,smooth,orientation}.ts` (React-free, tested with fixtures), `mesh.worker.ts` + `MeshClient`, `src/features/editor/{HealthPanel,RepairPanel,MeasureTool,AnalysisPanel,SectionSlider}`, viewport overlay hooks (highlight sets, clipping plane, per-vertex colours for maps), strings in en and ru, tests. Repaired meshes replace the object's source mesh id (the previous id stays in history; `originMeshId` keeps the import for "Revert to imported").
- `fillHoles` of `stl-import.ts` is reused and generalised; `describeMesh`/`flatFaces` are reused for flat regions.
- The "not a closed solid" messages of `41` get a "Repair" action pointing here.
- Out of scope: sculpting-type edits, remeshing for quality (isotropic), texture/colour repair, face and edge editing (`44`), cutting and splitting (`43`), automatic support generation, slicing-based analysis, AI repair.
- Version 1.13.0 (minor: a new capability).
- Depends on: `41-editor-op-stack` (the not-solid messages and Flatten link; mesh sources and stacks), which depends on the foundation `39`.
