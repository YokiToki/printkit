# Proposal

## Why

Two core CAD modeling limitations currently impede productive sketching:
1. Drawing circles, points, arcs, and regular polygons lacks typed numeric HUD inputs. Users must manually approximate dimensions with the cursor and later add explicit constraints, unlike rectangles and lines which support direct coordinate and dimension typing.
2. Sequential solid modeling ("sketch ➔ extrude ➔ sketch on face ➔ extrude...") is disjointed. Starting a sketch on a face requires switching to Face Selection Mode and hunting for a button in `FaceToolsPanel`. Once drawn, the sketch is not tied to the host body, and finishing the sketch does not prompt an extrusion or auto-select the host body for Join/Cut operations.

## What Changes

- **Universal HUD Numeric Input:** Generalize `SketchOverlay.tsx` HUD inputs to all shape tools:
  - `circle`: Center `X`, `Y` in Stage 0; Radius `R` or Diameter `Ø` in Stage 1 (toggled with `D` key).
  - `point`: Coordinates `X`, `Y`.
  - `arc`: Center `X`, `Y` → Radius `R` → Angles `A1`, `A2`.
  - `polygon`: Center `X`, `Y` → Circumradius `R` → Side count `N`.
  - Pressing `Tab` switches input fields, and `Enter` commits values with automated driving constraints.
- **First-Class Sketch on Face in Object Mode:** In Object Mode, clicking "New Sketch" allows directly picking any planar face under the cursor (highlighted on hover).
- **Host Body Association:** A face sketch records its host object id (`hostObjectId`). Moving or modifying the host object preserves sketch alignment.
- **Seamless Sequential Modeling Flow:** Finishing a closed sketch immediately surfaces a contextual "Extrude" action. When extruding from a face sketch, the operation automatically targets the host body and defaults to `Join` (when extruding outward) or `Cut` (when extruding inward into the body).

## Capabilities

### New Capabilities

### Modified Capabilities
- `editor-sketch`: Expand drawing tools to support universal typed HUD values for Circle, Point, Arc, and Polygon, and enable direct face selection for new sketches.
- `editor-sketch-features`: Update Extrude to auto-target host bodies with directional Join/Cut defaults upon finishing a face-based sketch.

## Impact

- Affects `src/features/viewport/SketchOverlay.tsx`, `src/features/editor/sketch/toolStateMachine.ts`, `src/features/editor/sketch/FeatureDialog.tsx`, `src/features/editor/EditorMode.tsx`, and `src/editor/sketch/model.ts`.
- Preserves backwards compatibility for existing sketches and scene documents.
- Target version: 1.17.0 (minor: new interactive HUD input capabilities and sequential face-sketch modeling workflow).
- Out of scope: Sketching on non-planar (curved) surfaces.
- Depends on: `44b-editor-viewport-navigation`.
