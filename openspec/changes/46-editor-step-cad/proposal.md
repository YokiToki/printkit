# Proposal

## Why

Polygonal meshes (STL and 3MF triangle meshes) are faceted: circles become polygons, cylindrical holes become faceted prisms, and smooth fillets become discrete strips of triangles. Modern 3D printing slicers (Bambu Studio, PrusaSlicer, OrcaSlicer) and desktop CAD systems (FreeCAD, Fusion 360, Onshape, SolidWorks) natively support STEP (ISO 10303) files. A solid exported as a STEP model preserves exact analytic geometry (true cylinders, planes, spheres, tori, and B-spline surfaces), allowing slicers to generate genuine arc G-code (`G2`/`G3`) with perfect circular holes and superior surface finish.

Furthermore, users frequently need to import existing STEP models created in desktop CAD tools to make adjustments, drill holes, cut them to fit the printer bed, or combine them with sketch-based features.

## What Changes

- **STEP Export (`.step` / `.stp`).** Export parametric solid bodies as standardized STEP files (AP214 / AP242) directly from the browser via the CAD WebAssembly worker (`occt-wasm`). Preserves genuine analytic topology: cylindrical holes, spheres, planes, and fillets. Bodies are named in the STEP product structure (`StepLabel`, part names, component hierarchy, and body colors).
- **STEP Verification & Self-Check.** An automated read-back check (`verifyStep`) parses the generated STEP string, computes volumes, compares edge counts, verifies closed-shell topology, and checks deviation against the source shapes to ensure the exported file is free of micro-gaps or flipped normals.
- **STEP Import.** Drag-and-drop or file picker import of `.step` and `.stp` files directly into the editor scene. Each imported part is converted into an `ImportFeature` solid in the object's operation stack, retaining part names, colors, and hierarchical grouping.
- **Tessellation Quality Controls.** When converting B-Rep CAD solids to Three.js view meshes or exporting to STL/3MF, user-configurable angular and linear deflection sliders ("Normal / High / Ultra quality") allow dialing in triangle density without modifying the underlying CAD geometry.

## Capabilities

### New Capabilities
- `editor-step-export`: export solid bodies to STEP (AP214/AP242) with part names, colors, and read-back verification.
- `editor-step-import`: import STEP models into scene objects as solid bodies with hierarchy and color preservation.
- `editor-cad-tessellation`: configurable deflection settings for viewport display and polygonal mesh export.

### Modified Capabilities

## Impact

- Extends CAD worker (`src/geometry/cad/kernel.ts`, `kernelStep.ts`), scene import/export pipeline (`src/features/editor/export/`, `src/editor/project/`), UI export dropdowns, strings in `en.json` and `ru.json`, and tests.
- Uses `occt-wasm` (dynamically loaded in the CAD worker).
- Version 2.1.0 (minor: new capabilities for CAD interchange).
- Depends on: `45-editor-project-default`.
