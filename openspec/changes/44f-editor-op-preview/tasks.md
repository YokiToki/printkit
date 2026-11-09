# Tasks

## 1. Worker Preview Pipeline

- [ ] 1.1 Implement preview request lane in `src/geometry/mesh/mesh.worker.ts` with job cancellation and prefix cache reuse. Test: worker test in `modelClient.test.ts`.
- [ ] 1.2 Implement `useOpPreview` hook in `src/features/editor/useOpPreview.ts` with 60 ms debounce, failure handling, and geometry cleanup. Test: unit test in `useOpPreview.test.ts`.

## 2. 3D Viewport Ghost Rendering and Drag Handle

- [ ] 2.1 Add `previewMesh` prop and rendering in `src/features/viewport/Viewport.tsx` using translucent color-coded physical materials (Blue Join, Red Cut, Purple Intersect). Test: mock test in `Viewport.test.tsx`.
- [ ] 2.2 Add interactive 3D arrow drag handle for directional distance adjustment with snap intervals. Test: interaction test in `Viewport.test.tsx`.

## 3. UI Integration across Operations

- [ ] 3.1 Connect live preview to `FeatureDialog.tsx` for Extrude and Revolve operations. Verification: visual check in browser dragging extrusion height.
- [ ] 3.2 Connect live preview to `FaceToolsPanel.tsx` for Push/Pull and EdgeBreak operations. Verification: visual check in browser pushing/pulling a cube face.
- [ ] 3.3 Verify preview geometry is completely ignored during measurement, bounding box, and STL export. Test: unit test in `editorParts.test.ts`.

## 4. Version

- [ ] 4.1 Bump `package.json` to 1.20.0 and add `1.20.0 — 44f-editor-op-preview` to `CHANGELOG.md`. Test: `npx vitest run src/site.test.ts`.

## 5. Verification

- [ ] 5.1 Run `npm test` and `npm run build` to ensure clean build.
- [ ] 5.2 Browser verification in EN and RU: test Extrude Join and Cut preview, Push/Pull ghost preview, and drag handle interaction.
