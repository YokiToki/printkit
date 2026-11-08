# Spec Delta

## Purpose
Specifies context menu support in the editor viewport shell.

## MODIFIED Requirements

### Requirement: Editor shell
The Editor SHALL show an outliner, a 3D view, a properties panel, and a unified command header. The header SHALL integrate site navigation with workbench-specific tools (Model vs Sketch) into a single row. The left and right sidebars SHALL have equal default widths of 280 px and support interactive drag-resizing between 220 px and 460 px with persistent storage. The 3D view and 2D sketch canvas SHALL support right-click context menus. Below 768 px the outliner and properties SHALL be drawers.

#### Scenario: Desktop
- **WHEN** the window is at least 768 px wide
- **THEN** outliner, view and properties are visible side by side and each side panel can be collapsed

#### Scenario: Narrow window
- **WHEN** the window is narrower than 768 px
- **THEN** the view fills the screen and the outliner and properties open as bottom drawers from the tool bar

#### Scenario: Unified header row
- **WHEN** the editor is displayed on desktop
- **THEN** the workspace renders a single consolidated top bar combining project logo, undo/redo, workbench tools, export, and language/unit switches without a secondary stacked toolbar

#### Scenario: Symmetric resizable sidebars
- **WHEN** the user drags a sidebar border handle
- **THEN** the sidebar width adjusts smoothly between 220 px and 460 px, and double-clicking the handle resets width to 280 px

#### Scenario: Workbench isolation
- **WHEN** entering sketch mode
- **THEN** the header switches to sketch drawing and constraint tools, the right panel switches to sketch constraints, and 3D object manipulation tools are hidden

#### Scenario: Viewport context menu
- **WHEN** the user right-clicks on a viewport entity or canvas without dragging
- **THEN** an accessible context menu opens with commands relevant to the selection
