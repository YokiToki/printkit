# Design

## Context

`39` provides `meshHealth` (counts), mesh sources in IndexedDB addressed by content hash, and `41` refuses booleans on open meshes. Repairs are *destructive* mesh edits (they change the source), unlike stack operations; the stack model of `41` handles that by Flatten and by applying repairs only to mesh sources: a repair produces a new immutable mesh and swaps the object's `source.meshId`, with undo restoring the old id. The reference tools are Meshmixer (Inspector, Make Solid, Reduce, Smooth), netfabb/3D Builder (auto repair) and slicer repair, plus the analysis views of PrusaSlicer/Bambu Studio.

## Goals / Non-Goals

**Goals**: reliable repair of typical downloaded STLs; honest reports (what was fixed, what was not); everything responsive on 500k-triangle meshes.
**Non-Goals**: geometry-preserving guarantees for broken input, quality remeshing, mesh sculpting.

## Decisions

1. **Half-edge-free analysis.** `analyze(mesh)` builds an edge map keyed by sorted vertex pairs (typed arrays, no objects per edge): per edge the incident triangle count and orientation consistency → open edges (1), manifold (2 consistent), non-manifold (>2), inconsistent winding (2 same direction). Boundary loops come from linking open edges; shells from union-find over triangles; volume from the signed tetrahedra; degenerate = area < 1e-12 mm² or duplicate vertex ids; duplicates = same sorted vertex triple. Output is a plain `Report` with index lists (for highlighting), no geometry objects.
2. **Self-intersections.** Triangle–triangle tests with a uniform grid broad phase (cell ≈ average edge length), Möller test, ignoring pairs that share a vertex or edge; capped at 5 M candidate pairs with a progress job and abort; reports count and the first 1000 pairs for highlighting. Large meshes can skip the check ("analyse intersections" is a button, not automatic).
3. **Repairs as pure functions** `(mesh, args) → {mesh, report}` in `geometry/mesh/`:
   - `weld(tolerance)`: spatial hash welding; default 1e-4 mm relative to the bounding diagonal.
   - `removeDegenerate`, `removeDuplicates`.
   - `fixOrientation`: BFS over shells propagating consistent winding across manifold edges, then flip the shell if its signed volume is negative; non-manifold edges break the propagation (reported).
   - `fillHoles(loops, {mode: 'flat'|'smooth', maxPerimeter})`: ear clipping on the loop projected on its best-fit plane for 'flat' (checking for self-overlap and falling back to a fan around the centroid); 'smooth' adds interior vertices by subdivision and relaxes them (Laplacian with the boundary fixed); a loop larger than the limit is skipped and reported; the existing `fillHoles` of `stl-import.ts` becomes the simple fallback.
   - `removeShells({maxTriangles, maxVolume, keepLargest})`.
   - `makeSolid({resolution})`: the winding-number field of the (possibly broken) mesh sampled on a grid with cell = resolution (default bbox diagonal / 400, min 0.05 mm), then `Manifold.levelSet` extraction at 0.5 — closed, manifold, self-intersection-free, slightly softened sharp edges; the memory estimate (cells × 4 bytes) is checked before starting and the resolution is raised or the job refused with the number. Marked in the UI as "rebuilds the surface".
   - `autoRepair`: weld → remove degenerate/duplicates → fix orientation → fill holes (default limit 20 mm perimeter) → remove tiny shells (< 0.1 % of the largest) → re-analyse; if still not manifold and the user allowed it, Make Solid. A report lists each step with counts.
4. **Decimate.** The manifold solid path uses Manifold's `simplify(tolerance)`; the UI takes a target ratio and searches the tolerance by bisection (≤ 8 evaluations) showing the achieved triangle count and the maximum deviation estimate (≤ tolerance). A non-manifold mesh is first run through `autoRepair` or refused with the reason. The result is a new mesh; the deviation preview colours vertices by distance to the original (sampled).
5. **Smooth.** Taubin (λ|μ) smoothing on the vertex graph with cotangent-free uniform weights; parameters strength 0–1, iterations 1–50; vertices on boundary loops and on sharp edges (dihedral > angle threshold, default 40°) are fixed; area-preserving by construction (μ < 0). Applied to mesh sources only.
6. **Orientation.** `layOnFace(mesh, triIndex, tol)` finds the connected planar region (normal within tolerance 1°, dihedral growth) and returns the rotation taking its normal to −Z; the same region function `planarRegion` is exported for `44`. `bestOrientations(mesh)` evaluates up to 24 candidates (the six axis-aligned flips plus the largest flat regions' normals) and scores `a·overhangArea + b·height − c·contactArea` (weights from slicer practice, documented), returning the top three as selectable previews; applying is one history step (a transform, not a mesh change).
7. **Measure.** Picking uses the raycaster against the mesh (BVH from `three-mesh-bvh` is added here if the foundation did not need it; MIT) and snaps to the nearest vertex, edge midpoint or face centre within 8 px. Circle fit is a least-squares fit in the plane of the picked points (≥ 3 points), reported with the fit residual; wall thickness casts a ray from the picked point along the inward normal to the first back-face hit. Results are `Measurement {kind, value, points}` in mm in world space, displayed with the unit setting and rendered as lines and labels; not stored in the document.
8. **Analysis overlays.** Overhang: per-triangle angle between the face normal and the bed normal after the object's matrix, coloured by a ramp beyond the threshold, drawn as a vertex-colour attribute (non-indexed copy only for the shown object; recomputed on transform commit, not during drag). Thin wall: per-vertex inward ray distance sampled on a subset (≤ 100k rays, worker), threshold = 2 × nozzle from the export settings. Open edges/flipped faces: line segments and colour set from the report. Section view: a clipping plane on the scene materials with a slider and an axis selector; no cap geometry.
9. **Worker.** `mesh.worker.ts` runs analyses and repairs with a `MeshClient` (latest wins per lane, cancel recreates the worker, progress through the job API of `31a`), like the photo worker. Meshes are transferred, not copied, and the result mesh is stored and registered like imports.
10. **Document.** A repair changes `source.meshId`; `source.originMeshId` (new optional field) remembers the first imported id so "Revert to imported" works across sessions; unused meshes are collected at load time except those referenced by `originMeshId`.
11. **UI.** A "Mesh" section in Properties for mesh objects (Health summary → Details expands lists with Show, Repair actions with options, Decimate, Smooth, Orientation, Revert); Measure and Analysis are tool bar toggles with their own small panels. No artboard exists: built from `ui/` components and tokens.

## Risks / Trade-offs

- **Self-intersection and Make Solid cost** on big meshes: limits, estimates, abort and clear messages; the first is optional, the second needs a confirmation with the estimate.
- **Fill holes quality** on large or twisted loops: size limit and the 'smooth' option; the report lists skipped loops.
- **Make Solid softens details**: the UI says so and recommends the finest resolution that fits the budget; it is never applied automatically unless Auto repair is allowed to.
- **Decimate on non-manifold input** can fail or tear; repair first, refuse otherwise.
- **Overhang map is orientation dependent** and ignores bridges; it is a visual aid, not a print simulation.

## Open Questions

- Whether `three-mesh-bvh` is needed already (decided by the performance task in `39`/here).
- Default weights of the best-orientation score (tuned on three reference models in task 4.3).
