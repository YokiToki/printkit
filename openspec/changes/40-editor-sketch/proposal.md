# Proposal

## Why

The foundation (`39`) lets the user import STL and combine primitives, but nothing can be created from scratch with real dimensions. In every desktop CAD the answer is the same loop: draw a profile on a plane, pin it down with constraints and dimensions, then extrude or revolve it into a solid. This is what turns the editor from a mesh viewer into a modelling tool: brackets, adapters, enclosures, clips, anything with exact holes and slots.

Most printed parts are an extruded profile with a few cuts, so a small, solid sketcher gives the largest gain. The plan and the research are in `openspec/EDITOR.md`; this change implements section 1 ("Эскиз") and the rule of section 2a: **the sketch and the feature parameters are the source, the mesh is derived.** Rounded rectangle corners are in from the start (rectangle with corner radius and a 2D Fillet/Chamfer tool), as the owner asked.

## What Changes

- **Sketch mode.** New sketches on the XY, XZ or YZ plane (with offset); entering a sketch aligns the camera orthogonally to the plane, shows a 2D grid, swaps the tool bar to sketch tools and the properties to the constraint/dimension list; *Finish sketch* (`Enter`) returns to the scene. Sketches are listed in the outliner under "Sketches" (rename, show/hide, edit, delete) and drawn in the view as curves when visible.
- **Drawing tools (v1):** Line / polyline, Rectangle (two corners or centre, with an optional **corner radius**), Circle (centre + radius), Arc (3 points, or centre-start-end), Slot (obround), regular Polygon, Construction toggle. Slot, Rectangle and Polygon are *macros* that create lines and arcs plus constraints, not new solver entities.
- **Editing tools:** **Fillet** and **Chamfer** of a 2D corner (arc tangent to both lines with a radius dimension), Trim, Mirror, Move by drag with the solver keeping constraints, Delete.
- **Constraints and dimensions.** Coincident, point on line / circle, horizontal, vertical, parallel, perpendicular, tangent, equal, symmetric, midpoint, fixed; dimensions: length, distance (also horizontal and vertical), radius / diameter, angle. Dimensions are editable numbers (`LengthField`, mm stored). Constraints are inferred while drawing (snap to endpoints, horizontal/vertical, tangent to an arc end) and can be added by hand.
- **Solver and status.** A small own solver (Levenberg–Marquardt on constraint residuals, see design); degrees of freedom shown in the status bar; under-defined geometry blue, fully defined black, conflicting or redundant constraints red with the offending constraints highlighted. Dragging a point re-solves live.
- **Profiles.** Closed loops are found from the visible, non-construction geometry; nested loops become holes; open loops, gaps and crossing curves are reported with their location. Regions are picked for a feature (default: all).
- **Features.** **Extrude** (distance, one side / symmetric / two distances, operation New / Join / Cut / Intersect, optional chamfer or fillet of the top and bottom edges) and **Revolve** (axis = a sketch line or a plane axis, angle 1–360°). A body built from sketches stores an ordered **feature list** `[Extrude, Revolve, …]` evaluated in order; each feature keeps its sketch reference and parameters, so editing a dimension of any sketch recomputes the body. A live preview is shown while the dialog is open.
- **SVG import** into a sketch: paths (lines, arcs, curves flattened to a tolerance), rect, circle, ellipse, polygon, with a scale dialog; the imported geometry is unconstrained and can be dimensioned or fitted later.
- **Document and history.** Sketches live in the scene document (`sketches`), bodies get the source kind `feature`; all sketch commands use the editor's undo/redo; stored positions are the solved ones, so the worker needs no solver.
- **Viewport extension** (generators untouched): a sketch layer (curves, points, constraint glyphs, dimension labels), pointer events converted to plane coordinates, orbit locked to pan/zoom while sketching.

## Capabilities

### New Capabilities
- `editor-sketch`: sketch planes, mode, drawing and editing tools, outliner entries.
- `editor-sketch-constraints`: constraints, dimensions, inference, solver, degrees of freedom and conflict reporting.
- `editor-sketch-features`: profiles, Extrude, Revolve, edge chamfer/fillet, feature list, preview.
- `editor-sketch-import`: SVG import into a sketch.

### Modified Capabilities

## Impact

- New `src/editor/sketch/` (React-free: `model.ts` entities and constraints, `solver.ts`, `dof.ts`, `infer.ts`, `tools/*` state machines and macros, `plane.ts`, `commands.ts`, `migrate.ts`) and `src/geometry/features/` (`profile.ts` loops/regions, `extrude.ts`, `revolve.ts`, `edgeBreak.ts`, `evaluate.ts`) and `src/geometry/svg.ts`; `src/features/editor/sketch/` (UI: `SketchToolbar`, `ConstraintPanel`, `DimensionTool`, `FeatureDialog`, `SketchList`, status line). `geometry/model.ts`: source kind `feature` in `generate('editor')`. `Viewport.tsx`: optional sketch layer. Outliner, properties, tool bar, hotkeys and strings (en, ru) of `39` are extended. Tests for every layer.
- No new runtime dependency is planned (own solver, own SVG parser); the spike (section 1) may replace the solver with a permissively licensed library if it is clearly better, and records the decision in `design.md`.
- Existing generators, scenes of `39` and stored keys keep working: the new fields are optional and the scene schema stays 1.
- Out of scope: sketch on a body face and projecting edges (`44`); spline, ellipse, text, offset curve, patterns and sketch blocks (later); named parameters and formulas; reference dimensions; Sweep and Loft; draft (taper) angle on Extrude; "extrude up to" a body; operations between bodies, feature reordering, suppression and a timeline UI (`41`, which generalises the feature list built here); DXF import; true B-rep fillets; 3D sketches.
- Version 1.11.0 (minor: a new capability).
- Depends on: `39-editor-foundation`.
