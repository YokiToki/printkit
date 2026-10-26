# Tasks

## 1. Check on keychain pictures (spike)

- [x] 1.1 (done in Node on the four sample pictures that exist, `scripts/eval-keychain-ai.ts`; the other pictures of the list are for the owner's check in 6.2) With `poc/ai/` in "whole image (Keychain)" mode, run the models of `32`'s shortlist on 6–10 pictures: a pet, a portrait, an object on a table, a plush toy, a logo with transparency, a two-tone logo, a wide landscape-format photo. Record per picture and model: subject found whole, stray fragments, edge quality at the threshold and smoothing that look best, time. Write the table and the per-model `maskDefaults` for keychain pictures into `design.md` (Open Questions) and `poc/ai/FINDINGS.md`. If a model cannot be used on keychain pictures say so and stop for `/opsx:update`.

## 2. Geometry (React-free)

- [x] 2.1 `geometry/raster/matte.ts`: `smoothThreshold(matte, w, h, radiusPx, threshold) → Uint8Array alpha`, `keepLargest(mask, w, h)`. Tests: threshold monotone (lower never shrinks), radius 0 equals plain threshold, smoothing does not lengthen the outline, keepLargest drops a speck and keeps an enclosed gap, ties and empty mask are safe.
- [x] 2.2 `SilhouetteParams.source` and `ai {model, threshold, smooth, keepLargest, matteId}`, `buildSilhouette` builds the alpha from the registered matte (`matteRegistry` in `geometry/model.ts`, `ModelClient.registerMatte`) and runs the unchanged pipeline; missing matte under `ai` falls back to Brightness and reports it in `SilhouetteResult`. Tests: with `source: 'brightness'` the existing regression volumes and bounding boxes are unchanged; a synthetic image plus matte gives the expected mask and the same relief as the equivalent alpha PNG; slider changes do not touch the registered matte; a missing matte reports the fallback.
- [x] 2.2a Automatic areas: `SilhouetteParams.autoOpen` (mm², default 150 for `ai`, 0 otherwise) and its use in `buildSilhouette` (size of each area in mm² from the part size; explicit per-area modes win; stable ids unchanged). Tests: a ring gap above the threshold is open and a speck gap below it is filled, an explicit mode survives a threshold change, 0 reproduces the existing behaviour and volumes, the size in mm² does not depend on the image resolution, the threshold works for a Brightness silhouette when set.
- [x] 2.3 `migrateKeychain` fills `source: 'brightness'` and the `ai` defaults for old records and normalises partial values. Tests: old record round-trip, partial and corrupt `ai` data fall back to defaults.

## 3. Image side

- [x] 3.1 `features/keychain/matteStore.ts` (or `imageStore` records of kind `matte`): put/get/delete by `imageId` + model + revision in the existing DB, memory fallback with the `persistent` flag, removal with the image. Tests with `fake-indexeddb`: round trip, replacing the image drops its matte, deleting a model does not, storage refusal falls back to memory.
- [x] 3.2 `features/keychain/matte.ts`: whole-image run through the `32` client (aspect kept, padded input, inference cap 2048, output cropped and resampled to the image size, progress, cancel, latest wins) and `useMatte` (state, restore on load, registration in the worker). Tests with a mocked client: padded input geometry for a wide and a tall image, output mapped back without distortion, cancel discards, a stale result does not replace a newer one, restore registers the stored matte without calling the client.

## 4. UI

- [x] 4.1 `SilhouetteSection`: source switch Brightness | AI (hides brightness threshold and invert under AI), `AiSilhouette` block (model picker with a link to the manager, Remove background button (disabled with a hint and a link to the manager without a model, active by itself after the download) with `AiStatus` (loader, current line, Cancel), shared `MaskTuning` with per-model defaults and the soft-matte view, keep-largest toggle, Open-areas-larger-than field in mm² (`NumberField`, with a hint), lost-result message, hints for transparent, logo and SVG). Strings in `en.json` and `ru.json`. No artboard exists: built from `ui/` components and `theme.css` tokens, said in the commit; compare in en and ru and at 390 px. Component tests: Brightness default and unchanged, controls hide and show per source, the button is disabled with a hint and a manager link when no model is ready and becomes active when the model store reports a model, the loader and the current line follow the events of a fake run, sliders update the silhouette without a client call, keep-largest, the threshold field opens and fills areas and does not override a mode the user set, hints, SVG has no AI, lost result falls back with a message, key parity.
- [x] 4.2 The enlarged mask dialog and `MaskPreview` show the AI silhouette and can switch to the soft matte view; areas, selection and everything downstream work on the AI silhouette. Tests: preview follows the source, the area list is built from the AI mask.

## 5. Version

- [x] 5.1 Bump to 1.5.0: `package.json` and a `CHANGELOG.md` entry `1.5.0 — 33-keychain-ai-silhouette`. Test: the existing version test passes with the new number.

## 6. Verification

- [x] 6.1 `npm test` and `npm run build` are green, the dev server starts, no console errors; with the Brightness source the existing keychain tests and volumes are unchanged.
- [x] 6.2 In the browser, en and ru and at 390 px, with a pet photo, a portrait and a logo: AI run with progress, silhouette and relief appear, sliders update without a model run (network panel shows no model activity), keep-largest drops a stray bit, a ring-shaped gap is open by itself and a small gap is filled, reload restores the same relief without a run, deleting the model keeps the silhouette, switching to Brightness and back works, a transparent PNG and an SVG behave as described, the exported STL is one valid piece, no request carries image data.
