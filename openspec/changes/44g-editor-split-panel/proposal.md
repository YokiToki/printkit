# Proposal

## Why

Splitting large models to fit printer beds currently relies on a detached modal dialog (`SplitDialog.tsx`) that creates several user experience issues:
1. The modal obscures the entire 3D scene, severing visual connection to the model.
2. It is not obvious which object is being split (no target name or dimensions shown in the modal header).
3. The 2D slice preview at the bottom of the dialog only shows a single isolated cross-section without spatial orientation or indication of which cut it represents.
4. Bed sizes are selected from a hardcoded list of presets rather than sharing the user's active 3D printer settings from the export configuration.

## What Changes

- **Non-Modal Side Panel (`SplitPanel`):** Replace `SplitDialog.tsx` with a contextual tool panel in the right sidebar, keeping the 3D viewport visible and interactive throughout.
- **Explicit Target Object Presentation:** The panel header prominently displays `Split: <Object Name>` with object dimensions ($X \times Y \times Z\text{ mm}$) contrasted against usable bed size ($W \times D\text{ mm}$).
- **Interactive 3D Cut Preview:**
  - Render translucent cutting planes directly inside the 3D viewport with draggable position handles.
  - Render the active printer bed footprint outline directly below the object.
  - Live color-code resulting split parts ($A1, B1, \dots$) with warning highlights for oversize parts.
  - Interactive exploded view slider to inspect mating faces in 3D.
- **Understandable Connector Placement:** Replace the disconnected 2D canvas with a per-cut selector ("Cut X1 at 120 mm") that clearly shows the two adjoining part labels and allows toggling pegs, pins, magnets, or dovetails.
- **Export Settings Bed Integration:** Default bed dimensions ($W, D, \text{margin}$) are derived directly from the global export printer profile (`data/printers.ts`), while retaining a custom override.

## Capabilities

### New Capabilities

### Modified Capabilities
- `editor-plane-cut`: Update the Split to Bed requirement to specify non-modal panel configuration and real-time 3D viewport cut preview.
- `editor-cut-connectors`: Update placement requirements to support per-cut inspection and selection from the 3D scene.

## Impact

- Removes `src/features/editor/cut/SplitDialog.tsx`.
- Adds `src/features/editor/cut/SplitPanel.tsx` and updates `EditorMode.tsx`.
- Connects bed dimensions to `useExportSettings()` from `src/features/export/`.
- Target version: 1.20.1 (patch: user interface rework of an existing capability without data schema changes).
- Out of scope: Non-planar or arbitrary angled split cuts.
- Depends on: `44d-editor-layout-workbenches`, `44f-editor-op-preview`.
