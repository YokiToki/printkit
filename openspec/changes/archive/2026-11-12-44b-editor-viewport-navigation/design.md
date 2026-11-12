# Design: Viewport Navigation and Adaptive 5×5 Grid

## Context
CAD applications like FreeCAD and Fusion 360 provide intuitive navigation where zooming continuously reveals finer decimal and 5×5 grid divisions, panning is seamless with standard modifier combinations (`Shift + Drag`), and zoom scaling remains consistent between 3D model space and 2D sketch mode. In PrintKit, fixed shader parameters and unnormalized wheel events created jarring jumps and gesture conflicts.

## Goals
- Compute hierarchical 5×5 grid intervals based on camera distance and FOV in both perspective and orthographic modes.
- Unify 3D ground grid and sketch plane grid shaders with major line emphasis every 5 minor lines.
- Implement delta-normalized cursor-anchored zoom matching Three.js `OrbitControls.dolly`.
- Route mouse events cleanly to separate camera panning (`Shift + Drag`) from box selection.

## Non-Goals
- Changing default camera rotation axis from Z-up.
- Fully customizable navigation keybinding profiles.

## Decisions

### Decision 1: Pure Grid Level Calculator (`gridLevels.ts`)
We calculate the screen scale `mmPerPx` at the plane target:
`mmPerPx = (2 * distance * Math.tan((fov * Math.PI) / 360)) / viewportHeight` in perspective, or `orthoHeight / viewportHeight` in ortho.
Levels scale by powers of 5 and 10: `..., 0.08, 0.4, 2, 10, 50, 250, 1250, ...`.
Given `mmPerPx`, we determine:
- `minorSpacing`: finest interval with screen spacing $\ge 12\text{ px}$.
- `majorSpacing`: $5 \times \text{minorSpacing}$.
- `subdivisionFade`: a $0..1$ alpha blending factor for the incoming sub-grid.

### Decision 2: Shared Grid Shader
Instead of creating dozens of line meshes in `buildSketchGrid`, both the ground grid and sketch plane use a custom GLSL shader plane that evaluates coordinates in the plane's local coordinate frame:
`line(coord, minorSpacing)` and `line(coord, majorSpacing)`.
Major lines render with higher opacity and thickness. In sketch mode, X and Y axes retain red and green overlays.

### Decision 3: OrbitControls-Aligned Zoom in Sketch
In `Viewport.tsx`:
```ts
const deltaY = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY
const zoomFactor = Math.pow(0.95, -deltaY * 0.002)
```
This guarantees identical trackpad pinch and mouse wheel sensitivity across 3D and 2D views.

### Decision 4: Gesture Dispatch Matrix
A pure function `classifyGesture(event, state)` determines action:
- `button === 0 && e.shiftKey && moved > 5`: `pan`
- `button === 0 && !e.shiftKey && moved > 5 && tool === 'select'`: `boxSelect`
- `button === 0 && !e.shiftKey && moved > 5 && isDrawingTool`: `drawDrag`
- `button === 0 && moved <= 5`: `clickSelect`

## Risks & Mitigations
- **Shader precision at sub-millimetre scales:** High-resolution grids ($0.08\text{ mm}$) can experience floating point moiré at large distances. The shader uses distance-based fadeout (`uFade`) to cull distant sub-grids.
