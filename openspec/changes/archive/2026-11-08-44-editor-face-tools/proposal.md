# Proposal

## Why

Until now the editor works on whole objects. Direct modelling — "grab this face and push it", "round this edge", "draw on this face" — is what makes CAD fast for small adjustments of existing parts, including imported STLs that have no history. It is also the answer to the most common request that a mesh kernel cannot do directly: fillets and chamfers. `openspec/EDITOR.md` (section 2a) fixes the approach: a mesh has no B-rep faces, so faces and edges are *recognised* from the mesh (flat regions, smooth patches, feature-edge chains), and the operations are built from boolean tools that match what was recognised, never by editing triangles.

## What Changes

- **Topological Naming Engine (`FaceFingerprint` / `EdgeFingerprint`).** Faces and edges are stored by geometric fingerprints (surface kind, centroid, normal/axis direction, area or length, radius, creating feature id) rather than volatile mesh indices. When rebuilding earlier steps, faces and edges are re-matched with tolerance, preventing downstream operations from breaking.
- **Selection modes & CAD Box Select.** Object / Face / Edge modes. Clicking selects faces or edges; CAD Box Select enables window picking: dragging to the right selects only elements fully enclosed (Window), dragging to the left selects anything touched (Crossing).
- **HUD Context Chips.** Clicking a face or edge spawns floating interactive badges directly beside the 3D cursor in the viewport:
  - *Planar face:* area, normal direction, buttons for *Sketch on face*, *Push / Pull*, *Hole here*, *Hide body*.
  - *Cylindrical face:* radius, diameter, axis, button for *Thread*.
  - *Edges:* length, radius, buttons for *Fillet* and *Chamfer* with the count of picked edges.
  - *Two elements (Ctrl+click):* distance $\Delta X, \Delta Y, \Delta Z$, angle or axis-to-axis spacing.
- **Push / Pull.** Drag with live 3D grips or type a distance on a selected planar face: positive pulls the face out, negative pushes it in. Works for sketch-built solids and imported bodies alike.
- **Fillet and Chamfer of edges.** Real 3D fillet and chamfer on edges of CAD solids: convex and concave edges, cylindrical top/bottom rims, variable radius, and angled chamfers, with live ghost preview and rollback tracking.
- **Sketch on face & Project edges.** A planar face becomes a sketch plane with origin and local axes aligned to face geometry; *Project edges* brings face outlines and selected edges into the sketch as fixed references.
- **Stack operations.** Push/Pull, Fillet and Chamfer are operations of the stack of `41` with stored topological fingerprints, re-resolved at evaluation time.

## Capabilities

### New Capabilities
- `editor-topological-naming`: geometric fingerprints for faces and edges, tolerance matching across rebuilds.
- `editor-subelement-selection`: face and edge modes, CAD box select (window/crossing), HUD context chips.
- `editor-face-ops`: Push/Pull with 3D grips, sketch on face, project edges.
- `editor-edge-ops`: 3D Fillet and Chamfer on CAD solid edges.

### Modified Capabilities

## Impact

- New `src/geometry/topology/{faces,edges,reference,classify}.ts` (React-free; `planarRegion` of `42` becomes its core), `geometry/features/ops/{pushPull,edgeBreak3d}.ts`, sketch plane kind `{face: Ref}` in `editor/sketch/plane.ts`, `features/editor/{FaceSelect,EdgeSelect,PushPullTool,EdgeBreakTool,ProjectEdges}`, viewport highlight layers and pointer modes, strings, tests.
- The 2D `edgeBreak` for extrusions of `40` is unchanged; this change adds the 3D variant for any body.
- Out of scope: variable-radius and rolling-ball fillets, fillets across curved faces and free-form edges, setback corners, draft and taper, move/rotate of faces, delete face/heal, face-to-face constraints, edge selection through loops on irregular meshes with noise (use Smooth/Decimate from `42` first), measurement of selected elements (the measure tool of `42` stays separate).
- Version 1.15.0 (minor: a new capability).
- Depends on: `41-editor-op-stack` and `42-editor-mesh-repair` (planar regions, picking, stack operations), via `43-editor-cut-split` in the linear order.
