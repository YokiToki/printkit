# Tasks: 46-editor-step-cad

## Implementation Tasks

- [ ] 1. Core STEP Export in CAD Worker
  - [ ] Implement `exportStep(shapes, labels)` and `exportStepMended` in `src/geometry/cad/kernelStep.ts`.
  - [ ] Add `verifyStep` read-back verification checking volume, edge count, and closed solid status.
  - [ ] Add Vitest tests for STEP round-trip (`tests/cadStep.test.ts`).

- [ ] 2. Core STEP Import in CAD Worker
  - [ ] Implement `importStep(text)` and `readStepParts(text)` extracting shapes, part names, and colors.
  - [ ] Support multi-solid compounds as distinct components.
  - [ ] Add tests for STEP import fixtures.

- [ ] 3. UI Integration & File Handling
  - [ ] Add "Export STEP (.step)" option to the Editor Export menu.
  - [ ] Add STEP file drag-and-drop / file picker handling in `src/features/editor/import/`.
  - [ ] Add Tessellation Quality settings dialog (linear and angular deflection presets).
  - [ ] Add i18n keys to `en.json` and `ru.json`.

- [ ] 4. Version Bump & Verification
  - [ ] Bump version to `2.1.0` in `package.json` and record entry in `CHANGELOG.md`.
  - [ ] Run `npm test` and `npm run build`.
