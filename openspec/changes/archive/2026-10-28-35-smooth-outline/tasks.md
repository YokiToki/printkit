# Tasks

## 1. Geometry (React-free)

- [x] 1.1 `geometry/outlineFit.ts`: `resample`, `findCorners`, `smoothLoop` (Gaussian along the loop with corners fixed), `fitLoop` (Schneider: chord-length parametrisation, least squares, reparametrisation, split) and `sampleCurves`. Tests: the fit of a circle uses few segments and stays within the tolerance, of a square keeps four corners, of a noisy circle absorbs the noise within the tolerance, a thin spike keeps its tip within the tolerance, a loop without corners is closed with continuous direction, the number of vertices drops at least five times on a traced tool outline fixture and the maximum distance to the original stays below the tolerance.
- [x] 1.2 `offsetCurve(samples, d)`: the clearance along the analytic normals, round join at convex corners, mitre at concave ones, fallback to the kernel's offset when the result self-intersects. Tests: the offset of a circle is a circle of radius + d, a convex tip is rounded with radius d, the tool's outline lies inside the offset everywhere, a tight concave notch falls back without a crash.
- [x] 1.3 Use in `createCutouts` (`tracedCutouts`) with `traceSilhouette` kept as it is: the traced loop goes through the fit, `OutlineSource.points` is the sampled polygon, an option keeps the original polyline. Tests: with the polyline option the existing outline tests are unchanged; with the fit the vertex count drops and the polygon stays within the tolerance of the original; classic silhouettes of both fixtures are identical to the frozen baseline (`32` task 2.1); the AI engine of `32` goes through the same path.
- [x] 1.4 Keychain outline (silhouette and shape plates) through the same stage as in `34`. Tests: the existing keychain regression volumes stay within their tolerances; the outline has fewer vertices and no ripple.

- [x] 1.5 `sampleCurves`: the step per cubic from the chord error (`ε = 0.1 × step`, `sqrt(8 R ε)`, limits 0.05 and 10 mm) instead of `min(step, fine)`; `offsetCurve` and the keychain outline use the same samples. Tests: a gentle arc and a long straight run get vertices farther apart than the step, a tight arc and a tip stay within the step, the chord error never exceeds `ε`, a smaller step gives more vertices, the extreme points of a cubic are sampled (exact bounding box), on both fixtures the fitted outline has at most 1.3 times the vertices of the 0.15 mm polyline and stays within the fit tolerance, the existing fit, offset and keychain regression tests stay green (update only the vertex-count expectations that assumed 1 mm).

## 2. UI

- [x] 2.1 Extend `OutlineControls` (introduced for Keychain in `34`) and use it under the silhouette step of the photo dialog: outline smoothness and fit tolerance (lengths, so `LengthField`), the vertex count, the option "original polyline", and a collapsed Advanced group with corner angle (degrees) and sampling step (`LengthField`) and a reset; strings in `en.json` and `ru.json`. No artboard exists: built from `ui/` components and `theme.css` tokens, said in the commit; compare in en and ru and at 390 px. Component tests: controls update the outline and the count, the Advanced group is collapsed by default and its reset restores 50° and 1 mm, a finer step raises the vertex count, the polyline option restores the previous result, steppers on every numeric input, key parity.

## 3. Version

- [x] 3.1 Bump to 1.7.0: `package.json` and a `CHANGELOG.md` entry `1.7.0 — 35-smooth-outline`. Test: the existing version test passes with the new number.

## 4. Verification

- [x] 4.1 `npm test` and `npm run build` are green, no console errors; the classic detection output on both fixtures is unchanged.
- [x] 4.2 In the browser, en and ru and at 390 px, with the owner's two photos and both engines: pockets show smooth walls at a grazing view in the 3D preview, the vertex count is several times lower, tips stay pointed, the clearance gives rounded convex corners, the exported STL of the bin is one valid solid, saved old sessions load unchanged.
  Checked 2026-10-28 on the two fixtures (480 × 640 stripped copies of the owner's photos), classic engine, en/ru, 390 px: vertices 1611 → 484 (flash) and 1965 → ~830 (noflash) after task 1.5, against 398 / 651 for the 0.15 mm polyline; walls smooth at a grazing view; exported STL one component, no unmatched edges; saved session with three old cutouts loaded unchanged. Not checked: the AI engine (needs a model download) and full-resolution photos.
