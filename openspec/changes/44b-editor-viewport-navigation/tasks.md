# Tasks

## 1. Grid Mathematics and Level Calculation

- [ ] 1.1 Create pure helper `src/features/viewport/gridLevels.ts` calculating `minor`, `major`, and `fade` factors from camera distance, FOV, and screen pixel height with 5×5 stepping. Test: `src/features/viewport/gridLevels.test.ts` (asserts step sequence and fade continuity).
- [ ] 1.2 Implement unified grid shader material supporting dynamic uniform updates (`uMinor`, `uMajor`, `uSubFade`, `uAlpha`, `uFade`). Test: unit test for shader initialization and uniforms.

## 2. 3D Viewport Ground Grid

- [ ] 2.1 Update `makeGrid` in `src/features/viewport/Viewport.tsx` to use the dynamic 5×5 level shader and connect render loop uniforms to `gridLevels`. Verification: browser check zooming from 2000 mm down to 1 mm; confirm smooth 5×5 line appearances.
- [ ] 2.2 Verify underside fade and ground plane opacity when orbiting below the XY plane. Verification: browser check with box model viewed from below.

## 3. Sketch Grid and Navigation

- [ ] 3.1 Refactor `buildSketchGrid` in `src/features/viewport/sketchMesh.ts` to use the adaptive shader with highlighted major 5×5 lines and preserved colored axes. Test: snapshot / geometry test in `sketchMesh.test.ts`.
- [ ] 3.2 Implement delta-normalized wheel zoom matching OrbitControls in `Viewport.tsx` `onWheel`, keeping cursor anchor intact. Test: unit test verifying zoom factor for mouse wheel and trackpad pinch.
- [ ] 3.3 Separate Shift-drag camera panning from selection gestures in `Viewport.tsx` using `classifyGesture`. Test: `src/features/viewport/gesture.test.ts` (asserts Shift+drag triggers pan and suppresses box selection).

## 4. Hotkeys and Documentation

- [ ] 4.1 Update hotkeys popover in `Toolbar.tsx` and i18n keys (`en.json`, `ru.json`) documenting `Shift + Drag` for camera panning and `Ctrl/Cmd + Drag` for additive box selection. Verification: visual check in browser in EN and RU.

## 5. Version

- [ ] 5.1 Bump `package.json` to 1.16.0 and add `1.16.0 — 44b-editor-viewport-navigation` to `CHANGELOG.md`. Test: `npx vitest run src/site.test.ts`.

## 6. Verification

- [ ] 6.1 Run `npm test` and `npm run build` to ensure all tests pass.
- [ ] 6.2 Browser verification in EN and RU: test zoom smoothness, adaptive 5×5 grid appearance, and Shift+drag panning in both 3D scene and sketch mode.
