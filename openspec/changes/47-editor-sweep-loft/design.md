# Design

## Architecture

1. **Sweep Implementation**:
   - Uses `occt.makePipe` / `BRepOffsetAPI_MakePipeShell`.
   - Trajectory wire is composed of continuous $C^1$ path segments (lines, arcs, B-splines).
   - Profile binormal mode:
     - `Frenet`: default moving frame along curve curvature.
     - `FixedUp`: maintains a constant up-vector along the path, preventing unprompted roll or self-intersection.

2. **Loft Implementation**:
   - Uses `BRepOffsetAPI_ThruSections`.
   - Validates that all profile loops are closed and oriented consistently.
   - Computes section centroids and perimeter lengths; aligns starting vertices to minimize torsional distortion (`loftFold`).
   - `ruled: boolean` flag toggles between linear ruled surfaces and cubic B-spline blend surfaces.

3. **Draft Implementation**:
   - Uses `BRepOffsetAPI_DraftAngle`.
   - Input: selected face fingerprints, neutral plane (origin and normal), pull direction vector, draft angle in degrees.
   - Evaluates whether selected faces can taper without topological self-intersection; reports invalid face angles gracefully.
