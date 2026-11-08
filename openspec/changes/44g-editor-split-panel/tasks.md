# Tasks

## 1. Split Panel Implementation

- [ ] 1.1 Create `src/features/editor/cut/SplitPanel.tsx` in the right sidebar with target object header, export printer bed synchronization, and cut axis controls. Test: component test in `SplitPanel.test.tsx`.
- [ ] 1.2 Replace `SplitDialog` in `EditorMode.tsx` with `SplitPanel`, wiring up open/close states and active target object tracking. Verification: visual check in browser opening Split from toolbar.
- [ ] 1.3 Remove legacy `src/features/editor/cut/SplitDialog.tsx` and its test. Verification: verify build passes without dead references.

## 2. 3D Viewport Split Preview

- [ ] 2.1 Render printer bed boundary wireframe and translucent cut planes inside `Viewport.tsx` during split configuration. Test: render test in `Viewport.test.tsx`.
- [ ] 2.2 Add interactive 3D translation handles to cut planes allowing dragging directly on the canvas. Verification: browser check dragging a cut plane along X.
- [ ] 2.3 Render color-coded preview parts ($A1, B1, \dots$) with real-time exploded gap inspection slider. Verification: visual check in browser with 2-cut part.

## 3. Per-Cut Connector Workflow

- [ ] 3.1 Implement cut selector list in `SplitPanel.tsx` displaying mating part labels and dimensions for each cut interface. Test: component test in `SplitPanel.test.tsx`.
- [ ] 3.2 Update `ConnectorEditor.tsx` with orientation indicators and boundary part labels. Test: component test in `ConnectorEditor.test.tsx`.

## 4. Version

- [ ] 4.1 Bump `package.json` to 1.20.1 and add `1.20.1 — 44g-editor-split-panel` to `CHANGELOG.md`. Test: `npx vitest run src/site.test.ts`.

## 5. Verification

- [ ] 5.1 Run `npm test` and `npm run build` to ensure clean build.
- [ ] 5.2 Browser verification in EN and RU: select large body, configure split along X and Y, drag cut planes in 3D, inspect connectors, apply split, and verify created cut groups.
