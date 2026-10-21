# Proposal

## Why

With `33-keychain-ai-silhouette` a photo gives a clean outline, but inside the outline the keychain is still a plain bevelled plate. A portrait of a cat (or a person, or a pet's face) is only recognisable by what is inside the outline: the eyes, the nose, the ears, the fur pattern. The owner tried this on a cat photo: the outline is good, the face cannot be seen on the keychain.

No single source of height does it. On the owner's cat photo (`poc/ai/FINDINGS.md`, images in `poc/ai/findings/`):

- **Contour** (the existing bevel from the silhouette edge) gives the body of the keychain and a clean edge, but is the same for every photo.
- **Depth** (Depth Anything V2 Small) gives the overall form: the head raised over the body, the muzzle over the cheeks. It is smooth and soft on fine features.
- **Detail** (local contrast of the brightness, on a crop of the face) gives exactly the features depth smooths out: the eyes, the nose, the whiskers, the forehead stripes, the ear; on the whole frame the face is too small for it, on a face crop it reads well and four tone levels still keep the face recognisable.

The three complement each other, so the relief is built as a **mix of the three**, with a share for each that the user controls, plus a crop so that the face has enough pixels.

## What Changes

- **Form mix.** The Relief source gets "Photo" next to Distance and Brightness. Under it three shares (Contour, Depth, Detail, in percent, normalised) are mixed into one height field; presets Subtle, Portrait and Deep set the shares, the height range and the detail settings, and edit to Custom. A share at zero switches that source off, and Contour alone is today's Distance source.
- **Depth.** Computed once by a model of kind `depth` from the model manager of `32` (Depth Anything V2 Small, Apache-2.0, 20–50 MB), stored with the image, normalised inside the silhouette so the background does not use up the height range.
- **Detail.** "Detail boost" (local contrast, radius in mm of the part so it means the same at any resolution) and optional "Tone levels" (2–8, soft or hard steps). Detail is zero-centred, so it adds structure around the form and does not lift the part by the photo's mean brightness.
- **Crop.** A non-destructive crop rectangle over the image (aspect lock, "fit to subject" from the AI mask box, reset). Everything after it works on the crop; the AI matte is cropped without re-running the network. Depth can be recomputed for the crop (more pixels on the face); a depth computed for another crop stays usable and is marked as such.
- **Whole frame silhouette.** A third silhouette source, "Whole frame", makes the crop a plaque (shape from the Base section) for a face portrait; the AI matte of `33` stays for cut-out heads and whole animals.
- **PoC.** `poc/ai/` has a "shape combiner": it takes the contour from a matte run, the depth from a depth run and the brightness of the same image, and shows the mixed height and a shaded relief with sliders for the three shares, the detail radius and levels, so the combination can be chosen before the work starts.

## Capabilities

### New Capabilities
- `keychain-photo-relief`: a relief built from contour, depth and detail, with crop and a whole-frame plaque.

### Modified Capabilities

## Impact

- `geometry/keychain.ts` (`KeychainParams.crop {x, y, w, h}` fractions applied to the image planes before the silhouette; `silhouette.source` gets `'frame'` (extends `33`); `SourceParams.kind` gets `'photo'` with `mix {contour, depth, detail}`, `depthId`, `boost`, `boostRadius` (mm), `levels`, `levelSoftness`; `registerDepth` and `depthRegistry` in the worker; `buildGrid` samples the planes through the brightness path), `geometry/raster/` (`localContrast`, `quantise`, `normaliseDepth`), `src/ml/` registry gets `kind: 'depth'` with external-data support, `features/keychain/` (`CropEditor`, `PhotoReliefBlock`, `useDepth`, depth records in `imageStore`, migration), strings in en and ru, tests.
- With the Distance or Brightness source, no crop, a traced silhouette, boost 0 and levels 0, the output equals the current one.
- Out of scope: real metric depth or 3D reconstruction, face detection for an automatic crop, line or edge extraction, sculpt or brush editing of the relief, multi-colour output, larger non-permissive depth models, Shape mode.
- Version 1.5.0 (minor: new options).
- Depends on: `33-keychain-ai-silhouette`, `32-photo-trace-ai`, `12-keychain-patterns`, `17-keychain-smoothing`, `29-beta-label`.
