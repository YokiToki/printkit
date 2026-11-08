# Proposal

## Why

The current editor layout wastes significant vertical screen space and suffers from visual fragmentation:
1. Two stacked full-width horizontal bars (the global app `Header` at 48–56 px and the editor `Toolbar` at 36–40 px) squeeze the 3D viewport.
2. The left sidebar (Outliner) is fixed at 240 px, while the right sidebar is fixed at 300 px; they cannot be resized, causing clipped labels in Russian localization and horizontal scrolling in nested panels.
3. Object tools and sketch tools are mixed without clear context boundaries; in sketch mode, 3D operations remain cluttering the sidebars and properties.

## What Changes

- **Unified Single-Row Editor Header:** Integrate the compact app header with the editor command bar into a single streamlined top bar (height 42 px) when inside `/editor`. Global links (Logo, Undo/Redo, Export, Unit, Language) share one row with the workbench command set.
- **Explicit Workbenches (Model vs Sketch):**
  - **Model Workbench:** Active when viewing 3D geometry. Exposes object creation (primitives, import, new sketch), transforms (select/move/rotate/scale), solid operations (extrude, revolve, boolean, pattern, push/pull, edge break), and inspection tools.
  - **Sketch Workbench:** Active when editing a 2D sketch. Top command row switches completely to drawing tools (Line, Rect, Circle, Arc, Polygon, Slot), constraints, construction toggle, DoF indicator, and a prominent "Finish / Cancel" cluster. Object manipulation tools are hidden.
- **Symmetric Resizable Sidebars:**
  - Both left (Outliner) and right (Properties / Context Tool) sidebars default to **280 px**.
  - Interactive drag-resizer handles allow resizing between 220 px and 460 px, persisted in `editor.ui`. Double-clicking resets to 280 px.
- **Unified Contextual Container:** The right panel always renders under a single titled container with breadcrumbs (e.g. `Properties > Extrude` or `Properties > Mesh Health`), eliminating cramped nested panels.

## Capabilities

### New Capabilities

### Modified Capabilities
- `editor-workspace`: Update the editor shell requirement to specify a unified single-row header, Model/Sketch workbench isolation, and symmetric resizable sidebars.

## Impact

- Affects `src/app/Header.tsx`, `src/features/editor/EditorMode.tsx`, `src/features/editor/Toolbar.tsx`, `src/features/editor/sketch/SketchToolbar.tsx`, and `src/features/editor/editorUiStore.ts`.
- Updates layout styling without breaking stored scene documents.
- Target version: 1.18.0 (minor: layout overhaul with resizable panels and workbench modes).
- Out of scope: User-customizable floating tool palettes or dockable windows.
- Depends on: `44a-storybook`, `44c-editor-sketch-input-face`.
