# Design: Universal Sketch HUD and Sequential Face-Modeling

## Context
Parametric CAD modeling relies on drawing with exact numerical inputs and repeatedly layering features: creating a base solid, picking one of its faces, drawing a sketch, and immediately adding or subtracting material. Currently in PrintKit, only lines and rectangles expose floating HUD inputs, and sketching on faces requires awkward selection mode switching.

## Goals
- Provide floating HUD input for all sketch drawing tools (Circle, Arc, Point, Polygon).
- Enable direct face selection for "New Sketch" directly from Object mode.
- Link sketches to their host body (`hostObjectId`) and auto-configure Extrude operations (Join/Cut).

## Decisions

### Decision 1: Declarative Tool HUD Schema
Instead of hardcoding `isRectTool` in `SketchOverlay.tsx`, we define a pure tool descriptor:
```ts
interface ToolHudSchema {
  stages: {
    fields: { name: string; label: string; unit?: 'mm' | 'deg'; defaultFromCursor?: boolean }[]
  }[]
}
```
For `circle`:
- Stage 0: `[{ name: 'x', label: 'X' }, { name: 'y', label: 'Y' }]`
- Stage 1: `[{ name: 'size', label: 'R' | 'Ø', toggleKey: 'D' }]`
Submitting Stage 0 moves state to Stage 1. Submitting Stage 1 adds the circle with a driving diameter constraint.

### Decision 2: Direct Face Raycast in Object Mode
When the user clicks "New Sketch" in the toolbar:
1. The viewport enters a temporary plane-picker state.
2. Raycasting hits either the default planes (XY, XZ, YZ) or any planar face of visible objects.
3. Hovering highlights the candidate face with an accent wireframe border.
4. Clicking resolves `FacePlaneDefinition` with origin and orientation, sets `sketch.hostObjectId = targetObject.id`, and opens sketch mode immediately.

### Decision 3: Sequential Modeling Transition (Extrude Quick-Action)
When `Finish Sketch` is pressed:
- If the sketch has at least one closed profile:
  - The sketch status bar / toast displays `[ Extrude ]` and `[ Revolve ]` quick-action buttons.
  - Clicking `Extrude` opens `FeatureDialog` with `sketchId` pre-filled.
  - If `sketch.hostObjectId` exists:
    - `targetObjectId` defaults to `sketch.hostObjectId`.
    - `op` defaults to `join` for positive extrusion distances along the face normal, and `cut` for negative distances.

## Risks & Mitigations
- **Face normal direction vs extrusion direction:** The face frame normal vector points outward. Extruding with distance $> 0$ adds material (`Join`), while distance $< 0$ enters the body (`Cut`). The UI shows an interactive direction flip toggle.
