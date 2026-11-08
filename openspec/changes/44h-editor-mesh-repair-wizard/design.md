# Design: Visual Mesh Repair Wizard

## Context
When users import broken STLs from third-party repositories, they need immediate visual feedback on what is broken, what the slicer will do, and whether the repair succeeded. We take UX inspiration from Sven Harzer's MeshDoc tool (licensed Source-Available, meaning we write our own algorithms clean-room and copy no code or assets) to enhance PrintKit's repair presentation.

## Goals
- Render defect lines (open edges, non-manifold vertices) rigidly parented to the mesh in 3D.
- Present an intuitive Before ➔ After comparative audit with delta badges ($\pm\Delta$).
- Support viewport comparison modes: Original, Repaired, and Split-view.
- Calculate filament mass (g) and length (m) for PLA, PETG, ABS, and TPU.
- Provide 1-click "Drop to Bed (Z = 0)" and "Center on Bed".

## Decisions

### Decision 1: Clean-Room Implementation & License Compliance
MeshDoc's license permits execution but restricts code duplication and derivative works. All diagnostic extraction, hole filling, normal healing, and UI rendering are implemented independently using PrintKit's existing `geometry/mesh` code and Three.js shader overlays. MeshDoc is credited in `README.md` References as a UX design reference.

### Decision 2: Defect Lines Overlay Layer
In `Viewport.tsx`, a specialized `DefectLines` group renders:
- Open boundary edges: `THREE.LineSegments` colored `#ef4444` (red), `depthTest: true`, with slight normal offset ($0.02\text{ mm}$) to prevent z-fighting.
- Non-manifold edges: `THREE.LineSegments` colored `#f59e0b` (amber).
These lines update automatically whenever `MeshAnalysis` completes.

### Decision 3: Audit Report Generator (`repairAudit.ts`)
A pure function `computeRepairAudit(beforeAnalysis, afterAnalysis)` returns:
- Delta values for vertices, triangles, holes, shells, and volume.
- Slicer readiness status: `isWatertight && isManifold && volume > 0`.
- Badges formatted as e.g. `+24`, `-12`, or `0`.

### Decision 4: Filament Estimation Calculator (`filamentEstimate.ts`)
Given solid volume $V\text{ (cm}^3)$, wall thickness factor, and infill percentage $I\in [0, 100]$:
$\text{Effective Volume } V_{\text{eff}} = V \times (0.2 + 0.8 \times \frac{I}{100})$
$\text{Mass } m = V_{\text{eff}} \times \rho\text{ (g)}$
$\text{Filament Length } L = \frac{V_{\text{eff}} \times 1000}{\pi \times (1.75 / 2)^2 \times 1000}\text{ (m)}$
Densities $\rho$: PLA 1.24, PETG 1.27, ABS 1.04, TPU 1.21.

## Risks & Mitigations
- **Overhead of dual-mesh memory during comparison:** Keeping both original and repaired meshes in memory for compare modes can consume RAM on large models. We keep the original in IndexedDB and swap GPU buffer geometries on demand when the compare toggle changes.
