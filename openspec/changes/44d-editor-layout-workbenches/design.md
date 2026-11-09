# Design: Unified Editor Header and Workbench Workspaces

## Context
As PrintKit's 3D editor features multiplied, the UI accumulated stacked rows and mismatched sidebars. In standard 1080p and 1440p displays, vertical space is critical for 3D modeling and 2D sketching. Consolidating the top row and equalizing the sidebars with drag-resizing provides a balanced professional CAD workspace.

## Goals
- Merge the app Header and Editor Toolbar into one 42 px row.
- Introduce explicit `Model` and `Sketch` workbench views.
- Standardize left and right sidebar widths to 280 px with draggable resize handles ($220..460\text{ px}$).
- Eliminate right-panel horizontal scroll and clipped Russian text.

## Decisions

### Decision 1: Consolidated Header Architecture
When mounted at `/editor`, the top row renders:
- **Left:** Logo `PrintKit`, document name, Undo / Redo buttons.
- **Center:** Workbench command strip:
  - In `Model`: Create (primitives, import, sketch), Transform, Features (Extrude, Revolve, Boolean, Pattern, Push/Pull, EdgeBreak), and Tools (Measure, Split, Repair).
  - In `Sketch`: Active sketch badge with plane name, Draw tools, Constraints, Construction toggle, DoF pill, and prominent Finish/Cancel buttons.
- **Right:** Viewport actions (Fit, Ortho/Persp), Export button, Language, and Units.

### Decision 2: Pure Resize Management (`useSidebarResize.ts`)
We create a pure pointer hook managing width dragging with mouse capture:
- Clamped between $220\text{ px}$ and $460\text{ px}$.
- Double-click on the splitter resets width to $280\text{ px}$.
- Widths are stored in `localStorage` under `editor.ui` as `leftWidth` and `rightWidth`.

### Decision 3: Right Panel Context Router
The right sidebar displays a single active sub-view with a consistent title and back navigation:
- `Properties` (default when body selected)
- `ConstraintPanel` (active during sketch)
- `FeatureDialog` (active when creating extrude/revolve)
- `CutPanel` / `FaceToolsPanel`
This prevents multiple nested panels from competing for vertical space.

## Risks & Mitigations
- **Responsive width overflow:** On displays smaller than 1200 px, toolbar items in the center could overflow. We implement an overflow dropdown menu (`...`) for secondary tools.
