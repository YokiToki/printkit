# Tasks

## 1. Check on the owner's photos (spike)

- [ ] 1.1 With `poc/ai/` run the depth models (Depth Anything V2 Small q4f16 and fp16, and V3 Small if an ONNX exists) on the cat photo and 3–5 other photos (a portrait, a plush toy, an object on a table): record whether the face forms read in the depth map, edge errors, time per backend. Then build a quick relief from the depth inside the AI matte (a throwaway script or the existing `buildGrid` with a test plane) and look at the 3D result; record the defaults for mix, boost and range in `design.md` (Open Questions) and `poc/ai/FINDINGS.md`. If a face is not recognisable in the relief with any setting, stop and update the artifacts with `/opsx:update`.

## 2. Geometry (React-free)

- [ ] 2.1 `geometry/raster/depth.ts`: `normaliseDepth(plane, mask?)` (2nd–98th percentile, over the mask when given, clamped 0…1) and `localContrast(gray, w, h, radiusPx, amount)`. Tests: monotone mapping, a constant plane gives a flat result without NaN, percentile clipping ignores outliers, mask limits the range, `amount` 0 returns the input, a gradient plus a small bump keeps the bump after boost.
- [ ] 2.2 `SourceParams.kind: 'depth'`, `depthId`, `depthMix`, `boost`; `registerDepth` / `depthRegistry`; `buildGrid` takes the depth plane through the brightness path (contrast, gamma, invert, smoothing, rim ceiling, clamp to silhouette), mixes the zero-mean local-contrast brightness, falls back to Distance when the plane is missing and reports it. Tests: with `distance` or `brightness` and `boost: 0` the existing regression volumes and bounding boxes are unchanged; a synthetic dome depth gives a dome relief inside the mask with the rim rolling off; the depth range is taken inside the mask (a far background does not flatten the subject); the mix adds structure without raising the mean; missing plane reports the fallback.
- [ ] 2.3 `migrateKeychain` fills the new source fields for old records. Tests: round trip, partial and corrupt values fall back to defaults.

## 3. ML and image side

- [ ] 3.1 `src/ml/` registry gets `kind: 'depth'` and external-data support (the data file's path, bytes and SHA-256, passed to the runtime as external data); the manager shows the kind and the picker filters by it. Tests: registry validation of the data file, download of both files with progress and cancel, a missing or mismatched data file fails the model, the manager lists depth models separately.
- [ ] 3.2 `features/keychain/depth.ts` and `useDepth`: whole-image run through the client (aspect kept, multiple of 14, inference cap 2048, resample back, normalise), store in `imageStore` as a `depth` record keyed by image, model and revision, restore on load, registration in the worker. Tests with a mocked client: input geometry for wide and tall images, output mapped back, cancel and latest-wins, restore does not call the client, replacing the image drops the record, deleting the model keeps it.

## 4. UI

- [ ] 4.1 Relief source choice gets Photo depth (Image mode only, hidden for SVG and without a mask): `PhotoReliefBlock` with the depth model picker, Compute depth with progress and cancel, mix slider (Depth ↔ Detail), Detail boost, the existing contrast, gamma, invert, smoothing, the Relief depth presets (Subtle, Portrait, Deep; Custom when edited), the depth greyscale view and the coarse-grid hint; Detail boost also under Brightness. Strings in `en.json` and `ru.json`. No artboard exists: built from `ui/` components and `theme.css` tokens, said in the commit; compare in en and ru and at 390 px. Component tests: option availability per mode, no model opens the manager, sliders update the relief without a client call, presets and Custom, lost result falls back with a message, hints, key parity, steppers on every numeric input.

## 5. Version

- [ ] 5.1 Bump to 1.5.0: `package.json` and a `CHANGELOG.md` entry `1.5.0 — 34-keychain-photo-relief`. Test: the existing version test passes with the new number.

## 6. Verification

- [ ] 6.1 `npm test` and `npm run build` are green, the dev server starts, no console errors; with the Distance and Brightness sources the existing keychain tests and volumes are unchanged.
- [ ] 6.2 In the browser, en and ru and at 390 px, with the cat photo and a portrait: AI silhouette, then Compute depth with progress, the face forms (nose, eyes, ears) are visible in the 3D relief, sliders update without a model run (no model activity in the network panel), reload restores the relief without a run, deleting the model keeps the relief, the STL is one valid piece that prints face up, no request carries image data.
