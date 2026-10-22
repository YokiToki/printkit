# Design

## Context

`traceSilhouette(seg, id, paper)` blurs the label mask (σ = 1 px at 4 px/mm), traces the 128 iso-line (`traceAlpha`), keeps the largest outer loop and simplifies it (`simplifyLoop`, 0.15 mm). The polygon becomes an `OutlineSource` cutout; `buildCutout` grows it by the clearance with `CrossSection.offset` and extrudes it. The result is a faithful but noisy polygon of about 3000 vertices per tool.

## Decisions

- **Fit curves, then sample them.** Schneider's algorithm (the one used by Potrace-like and vector-editor tools): chord-length parametrisation, least-squares cubic with given end tangents, Newton–Raphson reparametrisation, split at the point of the largest error until the error is below the tolerance. Runs between corners; between runs the tangent is not shared (a real corner), inside a run the split point's tangent is shared (G1). A loop without corners is cut in two with central-difference tangents. Tolerance default 0.15 mm (the existing `OUTLINE_TOLERANCE`).
- **Noise first, then fit.** The loop is resampled uniformly (≈ 0.17 mm), smoothed along the curve with corners held fixed (Gaussian σ default 0.25 mm: the one tuned for cutouts), then fitted; the fit tolerance absorbs what is left of the noise. The corner detector (turning angle over a ±3-vertex window, local maxima, default 50°) keeps pointed tips sharp.
- **Sampling.** Each cubic is sampled at about 0.5 mm along its length (uniform in `t`), which for curvature radii above 2 mm gives a chord error below 0.03 mm. The sampled polygon is what goes to the geometry kernel (Manifold needs polygons) and to STL; the curve is an intermediate representation.
- **Offset on the curve.** The clearance is applied to the samples along the analytic normals; at a convex corner (left turn of a counter-clockwise loop) round-join points at 15° steps, at a concave corner a mitre on the bisector (scale limited). Where this would self-intersect (clearance larger than the local radius) the kernel's offset (`CrossSection.offset`) is the fallback, as today.
- **Same stage for every source.** The stage takes a label mask or a soft field, so classic, AI (with the bicubic soft mask and the optional second pass of `32`) and keychain masks all go through it; the baseline detection code is untouched.
- **Opt-out.** "Use the original polyline" skips the fit and smoothing, reproducing the previous polygon exactly (this is also what the regression tests compare against).
- **Stored data.** An outline cutout keeps `{points, size}`; the points are now the sampled fitted polygon. Old sessions have denser polygons and load unchanged. Optionally the control points are stored with the points for later editing (not used yet).
- **Evidence (PoC).** Owner's flash photo, A4: classic outlines 8902 polyline vertices → 248 Béziers / 747 control points / 3214 sampled vertices after offset with round joins; AI 304 Béziers. Walls without ripple at a grazing view; the previous polyline with window-averaged normals still showed ripple.

## Risks / Trade-offs

- [Fitting rounds a real small feature] → tolerance 0.15 mm and corner detection; the control is exposed; the polyline option remains.
- [A spike thinner than the smoothing disappears] → corner-preserving smoothing and a smaller σ; checked by a test on a thin spike.
- [Self-intersection of the offset at tight concave features] → fallback to the kernel's offset.
- [Fit time on large outlines] → the fit is O(n) per iteration over a few thousand points per loop, milliseconds; done once per silhouette and cached with the outline.
