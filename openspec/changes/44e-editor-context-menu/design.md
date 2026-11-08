# Design: Universal Viewport Context Menu

## Context
Currently in PrintKit, only Outliner rows implement `onContextMenu`. Users interacting directly with objects, faces, or sketch profiles on the 3D canvas must divert focus to sidebars or toolbar buttons. Providing direct right-click contextual actions accelerates workflow and follows standard CAD usability conventions.

## Goals
- Create a shared `src/ui/ContextMenu.tsx` primitive.
- Unify Outliner actions and Viewport actions through a pure `contextActions(target, state)` action provider.
- Implement reliable right-click disambiguation against OrbitControls camera dragging.
- Support full keyboard accessibility (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`).

## Decisions

### Decision 1: Shared Action Tree Provider (`src/features/editor/contextActions.ts`)
We decouple menu rendering from event origin:
```ts
export interface MenuItem {
  id: string
  label: string
  icon?: ComponentType
  hotkey?: string
  disabled?: boolean
  danger?: boolean
  separator?: boolean
  action?: () => void
  children?: MenuItem[]
}
```
`buildObjectActions(objectId, doc, dispatch)` builds identical items whether triggered from an Outliner row or a 3D body click.

### Decision 2: Pointer Release Disambiguation in Viewport
In `Viewport.tsx`:
- On `pointerdown` with `e.button === 2`: record `downPos = { x: e.clientX, y: e.clientY }`.
- On `pointermove`: if $\text{hypot}(\Delta x, \Delta y) > 4$, mark `isNavigating = true`.
- On `pointerup` with `e.button === 2`: if `!isNavigating`, prevent default browser menu and fire `onContextMenu({ x, y, hit })`.

### Decision 3: Touch Support
On touch devices, a 500 ms long-press gesture on any entity dispatches the same context menu event at the touch coordinates.

## Risks & Mitigations
- **Context menu off-screen overflow:** The menu measures its rendered rect via `getBoundingClientRect` and flips orientation to stay within viewport bounds.
