# Tasks

## 1. Unified Single-Row Header

- [ ] 1.1 Implement consolidated header in `src/features/editor/EditorHeader.tsx` uniting global navigation, workbench tool strips, and right-aligned viewport/export actions into a 42 px row. No artboard exists; built from `ui/` components. Test: component test in `EditorHeader.test.tsx`.
- [ ] 1.2 Update `src/app/AppShell.tsx` and `src/features/editor/EditorMode.tsx` to mount the consolidated header and eliminate the secondary stacked toolbar. Verification: visual check in browser in EN and RU.

## 2. Workbench State and Tool Strips

- [ ] 2.1 Refactor `Toolbar.tsx` into Model Workbench tool groups (Create, Transform, Feature, Tools) with overflow dropdown handling. Test: interaction test in `Toolbar.test.tsx`.
- [ ] 2.2 Refactor `SketchToolbar.tsx` into Sketch Workbench tool strip with sketch badge, drawing tools, constraints, DoF counter, and Finish/Cancel buttons. Test: component test in `SketchToolbar.test.tsx`.

## 3. Symmetric Resizable Sidebars

- [ ] 3.1 Implement draggable splitter handle with bounds 220–460 px and double-click reset to 280 px in `src/features/editor/SidebarSplitter.tsx`. Test: unit test in `SidebarSplitter.test.tsx`.
- [ ] 3.2 Update `EditorMode.tsx` left Outliner and right Properties panels to use 280 px default width with persisted sizes in `editor.ui`. Verification: drag sidebars, refresh page, confirm widths persist.
- [ ] 3.3 Audit and fix all right-sidebar panels (`Properties.tsx`, `FeatureDialog.tsx`, `ConstraintPanel.tsx`) for 280 px width compatibility in Russian and English without horizontal overflow. Verification: visual check in browser.

## 4. Version

- [ ] 4.1 Bump `package.json` to 1.18.0 and add `1.18.0 — 44d-editor-layout-workbenches` to `CHANGELOG.md`. Test: `npx vitest run src/site.test.ts`.

## 5. Verification

- [ ] 5.1 Run `npm test` and `npm run build` to ensure clean build.
- [ ] 5.2 Browser verification in EN and RU: test layout at 1280×800 and 1920×1080; verify workbench switching between Model and Sketch; test sidebar dragging and collapse toggles.
