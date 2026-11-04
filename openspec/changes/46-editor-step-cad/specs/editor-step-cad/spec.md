# Specification: editor-step-cad

## Requirements

### Requirement: STEP Export
The editor shall allow exporting any solid or assembly of solids as a standardized STEP file.
- The exported file shall conform to ISO 10303-21 (STEP AP214 or AP242).
- True cylindrical, conical, spherical, planar, and toroidal faces shall be preserved as analytic B-Rep surfaces without faceting.
- Colors and body names assigned in the Outliner shall be embedded in the STEP document.
- The export routine shall perform read-back verification and log a warning if volume or edge discrepancies exceed 0.05%.

### Requirement: STEP Import
The editor shall support importing `.step` and `.stp` files.
- Drag-and-drop or file picker selection shall accept STEP files.
- Multi-body STEP assemblies shall be separated into individual objects or components with original part names and colors preserved.
- Imported solids shall participate in all downstream stack operations (Cut, Boolean, Hole, Thread, Fillet, Chamfer).

### Requirement: Adaptive Tessellation
The editor shall support adjustable deflection parameters for viewport visualization and polygonal mesh conversion (STL/3MF).
- Linear deflection shall scale with part dimensions.
- Angular deflection shall offer presets for Fast Preview and Fine Quality.
