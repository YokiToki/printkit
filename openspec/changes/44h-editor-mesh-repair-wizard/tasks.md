# Tasks

## 1. Pure Diagnostics & Estimation Helpers

- [ ] 1.1 Implement pure audit generator `src/geometry/mesh/repairAudit.ts` computing delta metrics ($\pm\Delta$) and slicer readiness boolean. Test: unit test in `repairAudit.test.ts`.
- [ ] 1.2 Implement pure filament mass/length calculator `src/geometry/mesh/filamentEstimate.ts` supporting PLA, PETG, ABS, and TPU with infill. Test: unit test in `filamentEstimate.test.ts`.

## 2. 3D Viewport Defect Lines & Compare Mode

- [ ] 2.1 Render defect lines (red open boundaries, yellow non-manifold edges) parented to the mesh in `src/features/viewport/Viewport.tsx`. Test: mock test in `Viewport.test.tsx`.
- [ ] 2.2 Implement viewport comparison toggles (Original, Repaired, Split-view) allowing interactive pre/post inspection. Verification: browser check switching views on a repaired test mesh.
- [ ] 2.3 Implement "Drop to Bed (Z = 0)" and "Center on Bed" transformation helpers in `src/features/editor/bedAlign.ts`. Test: unit test in `bedAlign.test.ts`.

## 3. Repair Wizard UI Integration

- [ ] 3.1 Upgrade `MeshSection.tsx` and `AnalysisPanel.tsx` to display Before/After comparative audit with delta badges and slicer readiness status. Test: component test in `MeshSection.test.tsx`.
- [ ] 3.2 Add Filament & Material Estimator card in `MeshSection.tsx` with density presets and infill slider. Verification: visual check in browser.
- [ ] 3.3 Verify license compliance: confirm no third-party code was copied from MeshDoc; add reference credit to `README.md`. Verification: code and license check.

## 4. Version

- [ ] 4.1 Bump `package.json` to 1.21.0 and add `1.21.0 — 44h-editor-mesh-repair-wizard` to `CHANGELOG.md`. Test: `npx vitest run src/site.test.ts`.

## 5. Verification

- [ ] 5.1 Run `npm test` and `npm run build` to ensure clean build.
- [ ] 5.2 Browser verification in EN and RU: import a non-manifold STL with holes, inspect on-model defect lines, run auto-repair, verify Before/After delta badges, test compare modes, and verify Drop to Bed.
