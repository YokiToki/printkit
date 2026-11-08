# Proposal

## Why

Modifying solid geometry operations in PrintKit is currently a "blind" process: when configuring Extrude, Revolve, Push/Pull, or Edge Fillet/Chamfer, the 3D scene remains completely static until the user presses "Apply". Users cannot visually gauge whether an extrusion clears a pocket or if a fillet radius looks proportional without repeatedly applying, undoing, and readjusting parameters.

## What Changes

- **Interactive Ghost Preview in Viewport:** While configuring an operation in `FeatureDialog`, `FaceToolsPanel`, or `Properties`, a translucent preview body renders in real time in the 3D viewport.
- **Color-Coded Operation Feedback:**
  - `Join` / `New Body`: Translucent accent blue (`--color-accent`, opacity ~0.55).
  - `Cut`: Translucent danger red (`--color-danger`, opacity ~0.55).
  - `Intersect`: Translucent purple (`--color-badge-purple`, opacity ~0.55).
- **Asynchronous Worker Preview Lane:** Dedicated `preview` communication lane in the Web Worker with 60 ms debouncing, cancellation of stale jobs, and prefix-cache reuse, ensuring immediate response without freezing the UI.
- **On-Canvas Distance Drag Handle:** An interactive on-canvas arrow handle aligned with the extrusion or push/pull normal vector, allowing direct dragging in 3D with step snapping while keeping panel inputs synchronized.
- **Clean Document Isolation:** Ghost preview geometry is strictly isolated from the document state, history stack, measurements, and export pipelines; closing or canceling the dialog instantly clears the preview.

## Capabilities

### New Capabilities
- `editor-op-preview`: Real-time translucent preview and interactive 3D drag handles for solid modeling operations.

### Modified Capabilities

## Impact

- Affects `src/geometry/model.ts`, `src/geometry/mesh/mesh.worker.ts`, `src/features/viewport/Viewport.tsx`, `src/features/editor/sketch/FeatureDialog.tsx`, and `src/features/editor/face/FaceToolsPanel.tsx`.
- Reuses existing `PrefixCache` and translucent tool rendering shaders.
- Target version: 1.20.0 (minor: interactive real-time visual feedback for 3D operations).
- Out of scope: Previewing multi-operation combinations simultaneously.
- Depends on: `44d-editor-layout-workbenches`.
