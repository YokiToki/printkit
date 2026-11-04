# Tasks: 47-editor-sweep-loft

## Implementation Tasks

- [ ] 1. Core Sweep & Loft in CAD Worker
  - [ ] Implement `sweep(profile, path)` supporting Frenet and Fixed-Up modes in `src/geometry/cad/kernel.ts`.
  - [ ] Implement `loft(profiles, ruled)` with profile vertex alignment in `src/geometry/cad/loftFold.ts`.
  - [ ] Implement `draftFaces(solid, faceHashes, origin, pull, angleRad)` in `src/geometry/cad/kernelFaces.ts`.
  - [ ] Add unit tests in `tests/cadKinematic.test.ts`.

- [ ] 2. Feature Definitions & Evaluator
  - [ ] Add `SweepFeature`, `LoftFeature`, `DraftFeature` to `features.ts`.
  - [ ] Update `build.ts` to evaluate sweep, loft, and draft steps in the op stack.
  - [ ] Support topological history tracking on swept and lofted faces.

- [ ] 3. UI Editors & Grips
  - [ ] Implement `SweepEditor` with path and profile picker.
  - [ ] Implement `LoftEditor` with profile ordering and alignment controls.
  - [ ] Implement `DraftEditor` with neutral plane selector and angle grip.
  - [ ] Add i18n keys to `en.json` and `ru.json`.

- [ ] 4. Version Bump & Verification
  - [ ] Bump version to `2.2.0` in `package.json` and update `CHANGELOG.md`.
  - [ ] Run `npm test` and `npm run build`.
