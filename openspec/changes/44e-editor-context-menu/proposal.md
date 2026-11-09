# Proposal

## Why

Contextual actions in PrintKit are severely constrained: right-clicking only works on rows inside the left Outliner tree. In the 3D viewport and the 2D sketch canvas, right-clicking is either captured exclusively by camera navigation or ignored completely. Users cannot right-click directly on a solid body, face, edge, empty space, or sketch entity to trigger natural CAD operations.

## What Changes

- **Universal Context Menu Component (`ui/ContextMenu`):** A portal-rendered, keyboard-navigable context menu component with submenus, separators, keyboard shortcut badges, and boundary-aware positioning.
- **3D Viewport Right-Click Menu:**
  - **On 3D Object:** Select, Rename, Hide/Show, Isolate, Duplicate, Delete, Fit, Operations submenu (Boolean, Mirror, Pattern), Repair (for meshes), Export Selected.
  - **On Empty 3D Space:** Add Primitive submenu, Import files, New Sketch (plane selector), Paste, Show All, Fit All.
  - **On Face (Face mode or hover):** New Sketch on this face, Push/Pull, Fillet face edges, Lay on Bed, Measure.
  - **On Edge (Edge mode or hover):** Fillet, Chamfer, Select chain.
- **2D Sketch Right-Click Menu:**
  - **On Sketch Entity:** Applicable geometric constraints (Coincident, Horizontal, Vertical, Tangent, Dimension), Construction toggle, Delete, Trim.
  - **On Empty Sketch Canvas:** Quick-switch draw tools, Normal to Sketch view, Finish Sketch, Cancel Sketch.
- **Gesture Disambiguation:** Right-click context menus open only on pointer release (`pointerup`) when total pointer movement during click is $\le 4\text{ px}$, preventing unwanted menu triggers during right-mouse camera orbits.

## Capabilities

### New Capabilities
- `editor-context-menu`: Universal context menu system for 3D objects, faces, edges, empty space, and 2D sketch entities.

### Modified Capabilities
- `editor-workspace`: Update editor shell requirements to specify viewport context menu availability across objects and canvas space.

## Impact

- Affects `src/ui/ContextMenu.tsx`, `src/features/viewport/Viewport.tsx`, `src/features/editor/Outliner.tsx`, `src/features/editor/EditorMode.tsx`, and `src/features/viewport/SketchOverlay.tsx`.
- Standardizes Outliner context actions with 3D viewport actions via a shared action builder.
- Target version: 1.19.0 (minor: comprehensive contextual menu system across all editor viewports).
- Out of scope: User-customizable context menu editor.
- Depends on: `44c-editor-sketch-input-face`, `44d-editor-layout-workbenches`.
