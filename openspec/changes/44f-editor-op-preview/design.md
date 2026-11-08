# Design: Operation Preview Pipeline

## Context
In professional CAD software, parameter changes render instantaneous ghost geometry so users can evaluate topology and collisions. PrintKit's Web Worker architecture evaluates operations via `Manifold` and already uses translucent meshes for Cutout tools. We extend this mechanism to provide instantaneous visual previews for Extrude, Revolve, and Face ops.

## Goals
- Add an asynchronous `preview` worker lane with debouncing (60 ms) and cancellation.
- Render color-coded preview meshes in `Viewport.tsx`: Blue for additions, Red for subtractions, Purple for intersections.
- Implement a 3D arrow gizmo for distance dragging with snapping.
- Maintain zero mutation of the persistent scene document until "Apply".

## Decisions

### Decision 1: Dedicated Worker Preview Lane
In `modelClient.ts`, we add `requestPreview(op, params)`:
- Cancels previous inflight preview requests.
- Uses a 60 ms debounce.
- Evaluates only the candidate operation (or reuses prefix cache for stack operations).
- Returns `MeshData` with `colorKind: 'join' | 'cut' | 'intersect'`.

### Decision 2: Viewport Ghost Mesh Layer
In `Viewport.tsx`, an independent `previewGroup: THREE.Group` holds:
- The translucent mesh with `MeshPhysicalMaterial`:
  - `transparent: true`, `opacity: 0.55`, `depthWrite: false`
  - Color bound to theme tokens: Blue (`#3b82f6`), Red (`#ef4444`), Purple (`#a855f7`).
- The 3D drag arrow: a cone + cylinder aligned with the extrusion normal vector. Drag events update the active tool distance state directly.

### Decision 3: Fast Cancellation on Dismiss
When `FeatureDialog` or `FaceToolsPanel` unmounts or cancels, `onClearPreview()` immediately disposes of geometries in `previewGroup` and cancels pending worker calculations.

## Risks & Mitigations
- **Heavy mesh compute lag:** On meshes with $>100\text{k}$ triangles, booleans can take $>200\text{ ms}$. If preview calculation exceeds $150\text{ ms}$, we compute and render the extrusion tool shape first (instant prism/cylinder), and compute the full CSG boolean in the background.
