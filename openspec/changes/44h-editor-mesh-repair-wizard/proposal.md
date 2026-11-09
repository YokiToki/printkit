# Proposal

## Why

While PrintKit contains repair algorithms in `src/geometry/mesh/`, its repair user experience is disjointed and difficult for 3D printer operators to evaluate:
1. Diagnosis requires expanding nested accordions in `MeshSection.tsx` without seeing where defects are situated on the 3D model.
2. Auto-repair applies changes in-place without a clear Before vs After comparison or quantifiable metrics (delta badges showing resolved vertices, holes, and shells).
3. Operators cannot verify whether a repaired STL is ready for slicing (Bambu Studio, PrusaSlicer, OrcaSlicer, Cura) or estimate material cost (filament weight and length across PLA/PETG/ABS/TPU).

We reference the UX workflow and visual inspection presentation of [MeshDoc](https://www.meshdoc.de/) (Sven Harzer) to upgrade PrintKit's repair interface into a visual repair wizard. Note: As MeshDoc is licensed under a Source-Available license prohibiting redistribution, no code or assets are copied or ported; all capabilities are implemented clean-room using PrintKit's existing `src/geometry/mesh/` algorithms and Three.js shaders.

## What Changes

- **In-Viewport Defect Visualization:** Highlight defects directly on the 3D mesh: open boundary loops in high-visibility red (`--color-danger`), non-manifold edges in yellow (`--color-warning`), and flipped triangles in tinted contrast.
- **Before / After Diagnostic Audit:** Display a comprehensive Before ➔ After comparison with exact change badges ($\pm\Delta$ vertices, triangles, holes, shells, volume, area) and a verified "100% Watertight / Manifold" status.
- **Compare Modes in Viewport:** A three-way view toggle:
  - *Original*: displays the unedited imported mesh.
  - *Repaired*: displays the candidate healed solid.
  - *Split-View*: side-by-side or clipped comparison.
- **Deep Multi-Pass Auto-Repair:** Upgrade `autoRepair` to perform spatial vertex welding, duplicate face removal, BFS outward normal winding, unconstrained planar ear-clipping hole closure, and small shell deletion, with Make Solid fallback.
- **Slicer Readiness & Bed Placement:** Quick-action buttons to "Drop to Bed (Z = 0)" and "Center on Bed", accompanied by a slicer readiness badge for Bambu Studio, OrcaSlicer, PrusaSlicer, and Cura.
- **Filament & Material Estimator:** Automatic calculation of model weight (g) and filament length (m) for PLA ($1.24\text{ g/cm}^3$), PETG ($1.27\text{ g/cm}^3$), ABS ($1.04\text{ g/cm}^3$), and TPU ($1.21\text{ g/cm}^3$) with configurable infill percentage ($0..100\%$).

## Capabilities

### New Capabilities

### Modified Capabilities
- `editor-mesh-health`: Add on-model defect wireframe overlay and slicer readiness audit with filament estimates.
- `editor-mesh-repair`: Add visual Before/After audit with delta badges, interactive compare modes (Original / Repaired / Split), and Bed drop/center helpers.

## Impact

- Affects `src/geometry/mesh/autoRepair.ts`, `src/features/editor/mesh/MeshSection.tsx`, `src/features/editor/mesh/AnalysisPanel.tsx`, and `src/features/viewport/Viewport.tsx`.
- Adds pure calculation modules: `src/geometry/mesh/filamentEstimate.ts` and `src/geometry/mesh/repairAudit.ts`.
- Fully backwards compatible; retains underlying Manifold and IndexedMesh pipelines.
- Target version: 1.21.0 (minor: comprehensive visual mesh repair wizard, defect overlays, and print readiness tools).
- Out of scope: Cloud mesh healing services, proprietary polygon remeshing.
- Depends on: `44a-storybook`, `44d-editor-layout-workbenches`.
