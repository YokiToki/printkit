# Proposal

## Why

A pocket in Cutout mode (and the outline of a keychain made from an image) is today a polygon of thousands of vertices traced from a pixel mask (`traceSilhouette`: blur, iso-line, simplification by 0.15 mm). The polygon follows every bit of noise of the detected edge, so the printed wall shows a fine vertical ripple, and the model carries thousands of needless vertices. The photo contour is also not "ideal" to begin with: what the user wants is the **shape** of the tool, not every wobble of the detection.

In the PoC (`poc/ai/`) a pocket built from fitted curves instead of the raw polyline has no ripple, and the same fit works for the classic and the AI silhouettes: on the owner's photo the classic outlines (8902 polyline vertices) become 248 cubic Bézier segments (747 control points), the AI outlines 304.

## What Changes

- **One shared outline stage for every source of silhouette.** After the silhouette is found (classic detection, AI mask, or a keychain mask), the outline is traced, smoothed along the curve (sharp corners kept) and **fitted with cubic Bézier curves** (Schneider's algorithm) to a tolerance (default 0.25 mm), corners detected by the turning angle (default 50°) staying real corners with G1-continuous curves in between.
- **Compact and smooth geometry.** The fitted curves are sampled into a polygon with a chord error well below the tolerance (a step of about 1 mm along the curve), so the model gets a few hundred vertices instead of thousands and walls without ripple. Clearance offsets are made on the curve (round joins at convex corners, mitre at concave ones).
- **Applies to both engines.** The classic detection (the baseline) is not changed: only the stage after it, so the baseline silhouettes stay identical and its outline gets smoother. The AI engine of `32` uses the same stage.
- **Controls.** "Outline smoothness" (σ, default 0.25 mm) and "Fit tolerance" (default 0.25 mm) and "Sampling step" (default 1 mm) under the silhouette step, with the vertex count shown; "Use the original polyline" as an option that restores the previous behaviour.
- **Keychain.** The image and shape silhouettes of Keychain use the same stage for their outline (see `34`).

## Capabilities

### New Capabilities
- `smooth-outline`: fitting of smooth curves with few points to silhouette outlines, shared by Cutout (both engines) and Keychain.

### Modified Capabilities

## Impact

- New pure module `geometry/outlineFit.ts` (resample, corner detection, along-curve smoothing, Schneider fitting, sampling, offset), used by `traceSilhouette` callers in `features/cutout/photo/createCutouts.ts` and by the keychain outline; `segment.ts`, `colour.ts` and the classic detection are not edited, their frozen-output test (`32`, task 2.1) stays green; the `OutlineSource` points of a cutout become the sampled fitted polygon (the stored `points` keep their shape, so saved sessions load unchanged); strings in en and ru, tests.
- Out of scope: changing the classic silhouette detection, editing the outline by hand (node dragging), exporting curves as such (STL and 3MF stay polygonal), smoothing of mesh cutouts (STL imports).
- Version 1.7.0 (minor: a new option that also improves existing output).
- Depends on: `25a-photo-trace-improvements`, `29-beta-label`; works with `32` and `34` (they use it) but does not require them.
