# Design

## Architecture

The STEP import/export pipeline is hosted inside the CAD Web Worker (`src/geometry/cad/reWorker.ts`) powered by `occt-wasm`:

1. **STEP Export Flow**:
   - Scene solids (`Shape` handles in the OCCT memory arena) are collected along with their metadata (`StepLabel`: name, color, component path).
   - `exportStepMended(shapes, labels)` is invoked:
     - Sets up `STEPCAFControl_Writer` with units set to millimetres and protocol `AP214CD` or `AP242`.
     - Maps solid bodies into the XCAF document with RGB color attributes and hierarchical component labels.
     - Performs a verification pass (`verifyStep`): reads back the exported STEP string into a temporary reader, checks `isClosedSolid()`, measures volume discrepancies ($< 0.05\%$), and inspects open boundary edges.
   - The generated ASCII STEP string is returned to the main thread and saved to disk with MIME type `model/step`.

2. **STEP Import Flow**:
   - Uploaded `.step` or `.stp` bytes/text are transferred to the worker.
   - `STEPCAFControl_Reader` parses the assembly tree, extracts top-level compounds and solids, reading part names and colors.
   - Each solid is converted into an active `Shape`, tessellated into Three.js `MeshData` via `meshEveryFace` (preserving `faceGroups` for subelement selection), and added to the scene store as an `ImportFeature`.

3. **Tessellation Quality**:
   - Deflection formula:
     - Linear deflection: $\delta = \min(0.05, 0.001 \times \text{diagonal})$
     - Angular deflection: $0.15$ rad (~$8.5^\circ$) for preview, $0.05$ rad (~$2.8^\circ$) for high quality.
