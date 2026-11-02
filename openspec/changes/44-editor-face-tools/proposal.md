# Proposal

## Why

Until now the editor works on whole objects. Direct modelling — "grab this face and push it", "round this edge", "draw on this face" — is what makes CAD fast for small adjustments of existing parts, including imported STLs that have no history. It is also the answer to the most common request that a mesh kernel cannot do directly: fillets and chamfers. `openspec/EDITOR.md` (section 2a) fixes the approach: a mesh has no B-rep faces, so faces and edges are *recognised* from the mesh (flat regions, smooth patches, feature-edge chains), and the operations are built from boolean tools that match what was recognised, never by editing triangles.

## What Changes

- **Selection modes** Object / Face / Edge, switchable on the tool bar and by `1`/`2`/`3` held with Ctrl (or the mode buttons). In Face mode a click selects a *face region*: a flat region (coplanar, tolerance 1°) or, when the surface is smooth, a smooth patch (triangles joined with dihedral below a threshold, default 30°); Shift adds regions, double click grows to tangent-connected regions. In Edge mode a click selects a *feature edge chain*: sharp edges (dihedral above the threshold) joined through vertices of degree two; chains classify as straight, circular (circle fit within tolerance) or free.
- **Push / Pull.** Drag or type a distance on a selected planar face: positive pulls the face out (adds a prism of the face outline), negative pushes it in (subtracts). Works for faces with holes, for several faces of the same normal, and on sketch-built and imported bodies alike. Non-planar faces are refused with the reason.
- **Fillet and Chamfer of edges.** Convex and concave straight edges between two planar faces, and circular edge loops (the top rim of a cylinder, a hole's edge), with a radius or distance; built as swept/revolved tool profiles combined by Boolean. Corners where several selected edges meet are filled with an acceptable blend (mitre-joined tools, not a rolling-ball); free-form and curved-surface edges are refused with the reason.
- **Sketch on face.** A planar face (or a flat region of an imported mesh) becomes a sketch plane with an origin at the picked point, the x direction along the longest straight edge or a world axis; **Project edges** brings the face outline, selected edges and circles (recognised from circular chains) into the sketch as geometry or construction. The sketch's plane stores a face reference that is re-resolved when the body changes; if it cannot be resolved the sketch keeps its last frame and shows a "detached" warning.
- **Stack operations.** Push/Pull, Fillet and Chamfer are operations of the stack of `41` with stored face/edge *references* (point, normal, kind) rather than triangle indices, re-resolved at evaluation time; a reference that does not resolve to exactly one element fails the operation with the reason.
- **Highlighting and feedback.** Hovered and selected faces/edges are highlighted, selection size is shown in the status bar (n faces, area, length), and the available operations follow the selection.

## Capabilities

### New Capabilities
- `editor-subelement-selection`: face and edge modes, recognition, highlighting, references.
- `editor-face-ops`: Push/Pull, sketch on face, project edges.
- `editor-edge-ops`: Fillet and Chamfer of straight and circular edges.

### Modified Capabilities

## Impact

- New `src/geometry/topology/{faces,edges,reference,classify}.ts` (React-free; `planarRegion` of `42` becomes its core), `geometry/features/ops/{pushPull,edgeBreak3d}.ts`, sketch plane kind `{face: Ref}` in `editor/sketch/plane.ts`, `features/editor/{FaceSelect,EdgeSelect,PushPullTool,EdgeBreakTool,ProjectEdges}`, viewport highlight layers and pointer modes, strings, tests.
- The 2D `edgeBreak` for extrusions of `40` is unchanged; this change adds the 3D variant for any body.
- Out of scope: variable-radius and rolling-ball fillets, fillets across curved faces and free-form edges, setback corners, draft and taper, move/rotate of faces, delete face/heal, face-to-face constraints, edge selection through loops on irregular meshes with noise (use Smooth/Decimate from `42` first), measurement of selected elements (the measure tool of `42` stays separate).
- Version 1.15.0 (minor: a new capability).
- Depends on: `41-editor-op-stack` and `42-editor-mesh-repair` (planar regions, picking, stack operations), via `43-editor-cut-split` in the linear order.
