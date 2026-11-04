# Proposal

## Why

Extrude and Revolve cover straight prisms and axisymmetric bodies, but many functional 3D-printed parts require complex transitional shapes and curved trajectories:
- **Sweep**: routing conduits, handles, curved brackets, ducting, and custom piping along arbitrary 2D or 3D guide curves.
- **Loft**: smooth transitions between disparate cross-sections, such as round-to-rectangular vacuum adapters, aerodynamic fairings, propeller blades, and ergonomic grips.
- **Draft**: tapering vertical faces at an angle (1–15°) to eliminate overhangs, improve layer adhesion in 3D printing, or prepare molds for casting.

## What Changes

- **Sweep Feature (`SweepFeature`).** Sweeps a 2D sketch profile along a trajectory path composed of connected sketch lines, arcs, and splines. Supports Frenet and Fixed-Up binormal orientation modes to prevent twisting, with optional join, cut, or new body operations.
- **Loft Feature (`LoftFeature`).** Blends between two or more sketch profiles on parallel or non-parallel planes. Supports ruled (straight faceted transitions) and smooth B-spline lofts, with automatic or manual guide-vertex mapping to prevent twisting.
- **Draft Angle Feature (`DraftFeature`).** Applies a taper angle to selected planar or cylindrical faces relative to a neutral plane and pull direction vector.
- **Interactive Viewport Editing.** Visual guide curves, path pickers, neutral plane selector, and interactive angular grips for draft manipulation.

## Capabilities

### New Capabilities
- `editor-sweep`: sweep 2D profile loops along 2D/3D trajectory paths with orientation controls.
- `editor-loft`: multi-profile lofting with ruled and smooth transitions.
- `editor-draft`: face draft / taper angle relative to a neutral plane.

### Modified Capabilities

## Impact

- Extends CAD kernel (`src/geometry/cad/kernel.ts`, `kernelFaces.ts`, `loftFold.ts`, `sweepRoute.ts`), feature definitions in `src/geometry/features/`, UI editors `src/features/editor/features/{SweepEditor,LoftEditor,DraftEditor}`, strings in `en.json` and `ru.json`, and tests.
- Version 2.2.0 (minor: advanced kinematic solid modeling).
- Depends on: `44-editor-face-tools`, `46-editor-step-cad`.
