# Tasks

## 1. ContextMenu UI Component

- [ ] 1.1 Implement accessible `src/ui/ContextMenu.tsx` with screen boundary clamping, submenus, hotkey badges, and keyboard navigation (Arrows, Enter, Esc). Built from `design/artboards/Components.dc.html`. Test: `ContextMenu.test.tsx` and Storybook story.
- [ ] 1.2 Implement pure action tree builder `src/features/editor/contextActions.ts` for objects, empty space, faces, edges, and sketch entities. Test: unit tests in `contextActions.test.ts`.

## 2. 3D Viewport Integration

- [ ] 2.1 Implement right-click pointerup disambiguation in `src/features/viewport/Viewport.tsx` to separate camera orbit from menu opening. Test: unit test in `Viewport.test.tsx`.
- [ ] 2.2 Wire up 3D object and empty-space context menus in `EditorMode.tsx`. Verification: browser check right-clicking objects and background.
- [ ] 2.3 Wire up face and edge context menus (Sketch on face, Push/Pull, Fillet, Chamfer). Verification: browser check on box model in Face/Edge mode.

## 3. Sketch Overlay and Outliner Integration

- [ ] 3.1 Refactor `Outliner.tsx` to use `ContextMenu` and `contextActions`. Test: component test in `Outliner.test.tsx`.
- [ ] 3.2 Wire up sketch canvas right-click in `SketchOverlay.tsx` with constraints for entities and canvas actions on background. Test: component test in `SketchOverlay.test.tsx`.

## 4. Version

- [ ] 4.1 Bump `package.json` to 1.19.0 and add `1.19.0 — 44e-editor-context-menu` to `CHANGELOG.md`. Test: `npx vitest run src/site.test.ts`.

## 5. Verification

- [ ] 5.1 Run `npm test` and `npm run build` to ensure clean build.
- [ ] 5.2 Browser verification in EN and RU: test context menu on 3D body, empty space, face, edge, Outliner row, and sketch entity.
