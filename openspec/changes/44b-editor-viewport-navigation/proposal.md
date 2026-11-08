# Proposal

## Why

Navigation and spatial awareness in the 3D editor and sketch mode suffer from three critical issues:
1. The 3D grid and sketch grid use fixed minor/major spacings (10 mm / 50 mm) without dynamic subdivision; zooming in leaves wide empty gaps instead of revealing sub-millimetre detail.
2. Sketch zoom reacts abruptly to mouse wheel and trackpad gestures because it uses an arbitrary fixed step (`0.87 / 1.15`) rather than the smooth, delta-normalized dolly curve of 3D `OrbitControls`.
3. In sketch mode, dragging with `Shift + Left Click` (the standard FreeCAD/CAD pan shortcut) triggers both view pan and a box-selection rectangle simultaneously.

## What Changes

- **Adaptive 5×5 Hierarchical Grid:** Replace fixed grid shaders with a FreeCAD-style hierarchical adaptive grid algorithm. As the camera zooms in or out, sub-grids subdivide recursively in 5×5 steps (e.g. 250 mm → 50 mm → 10 mm → 2 mm → 0.4 mm → 0.08 mm), smoothly fading in and out based on screen pixel density.
- **Unified Sketch Grid with Major 5×5 Lines:** Replace static `LineSegments` in `buildSketchGrid` with the adaptive shader plane. Every 5th line is visually emphasized as a major line, while primary axes (X/Y) retain distinct colored lines.
- **Synchronized Sketch Zoom:** Replace the discrete `onWheel` zoom factor in `Viewport.tsx` with a continuous dolly calculation matching OrbitControls, respecting `deltaMode` (pixel/line/page) and cursor anchoring.
- **Gesture Separation (Shift+Pan vs Box Select):** Distinguish `Shift + Drag` (camera panning) from `Left Drag` (box selection). Shift+Drag pans smoothly without initiating selection rectangles or clearing active drawing states. Additive box selection moves to `Ctrl/Cmd + Drag` or explicit modifier.

## Capabilities

### New Capabilities

### Modified Capabilities
- `model-viewport`: Update the ground grid requirement to specify adaptive hierarchical 5×5 grid subdivision on zoom.
- `editor-sketch`: Update sketch mode navigation to specify adaptive 5×5 grid visualization, synchronized smooth zoom, and Shift+drag camera pan separation.

## Impact

- Updates `src/features/viewport/Viewport.tsx`, `src/features/viewport/sketchMesh.ts`, and adds pure tested helper `src/features/viewport/gridLevels.ts` and `src/features/viewport/gesture.ts`.
- Affects both 3D scene view and 2D sketch overlay.
- Target version: 1.16.0 (minor: new adaptive grid visualization and enhanced viewport interaction behaviors).
- Out of scope: User-customizable grid color themes, full navigation style presets (Blender/Revit keys).
- Depends on: `44-editor-face-tools`.
