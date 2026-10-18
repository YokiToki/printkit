# Design

## Context

`SourceParams = {kind: 'distance' | 'brightness', contrast, gamma, invert, smooth, despeckle}`. In `buildGrid` the brightness source samples the image's gray plane at the grid nodes inside the silhouette (`gray`), maps it with `brightnessValue` and turns it into heights (`floor + value × (hmax − floor)`), with the rim ceiling, smoothing (masked Gaussian), profile, detail lines and patterns after it. `33` adds the AI silhouette and the matte registry and uses `src/ml/` of `32`.

The photo-relief problem is not the silhouette but the interior. A depth map answers "what is closer to the camera", which for a face is the form. It is relative and smooth: it will not carry whiskers or fur texture, and it has soft errors at the subject's edge, which the matte mask covers.

## Goals / Non-Goals

**Goals:**
- A recognisable bas-relief of a face or object from one photo, with controls the user can understand.
- No change for existing keychains; no data leaves the browser.

**Non-Goals:**
- Metric depth or 3D reconstruction, sculpting, face-specific models, multi-colour.

## Decisions

- **Depth plane like the text mask and the matte.** The main thread runs the depth model through the `32` client and gets a `Float32` plane normalised to 0…1 (2nd–98th percentile, farther = 0, nearer = 1) at the image's resolution; it is registered once in the worker (`registerDepth`, `depthRegistry`) and params carry `source.depthId`. `buildGrid` samples it where it samples brightness. Sliders (contrast, gamma, invert, smoothing, mix) then only rebuild in the worker. Alternative: bake the depth into the image's gray plane. Rejected: loses the original brightness needed for the mix and for switching sources.
- **Input and aspect.** The whole image, long side capped at 2048, padded or resized to the model's multiple of 14 (518 for Depth Anything V2 Small) keeping the aspect ratio; output resampled bilinearly back to the image size, as for the matte in `33`.
- **Model.** Depth Anything V2 Small ONNX (`onnx-community/depth-anything-v2-small-ONNX`, Apache-2.0): q4f16 20 MB, fp16 50 MB, weights in a separate `.onnx_data` file, so the ML runtime needs external-data support (path and bytes of the data file in the registry entry, SHA-256 for both files). The PoC runs it; Base and Large are non-commercial and not offered; Depth Anything 3 Small (Apache-2.0, newer) is a candidate to compare. The registry gets `kind: 'depth'` next to `matte`; the manager shows the kind and filters the picker by it.
- **Relief from depth.** Inside the AI silhouette the height is `floor + value × (hmax − floor)` with `value` = the mix of depth and local-contrast brightness. Because depth inside the silhouette may be nearly flat across the body, the depth is renormalised over the silhouette pixels only (robust min/max inside the mask), otherwise the background range would waste the height budget. The silhouette edge still goes through the bevel ceiling of the existing relief (the rim rolls off), so the edge of the cat does not stand as a cliff.
- **Mix with brightness.** `depthMix` (0–1, default 0.25 brightness): `value = (1 − m)·depth + m·brightnessDetail`, where `brightnessDetail` is the local-contrast brightness (below) re-centred to zero mean so it adds relief around the depth form instead of lifting the whole image. It brings fine structure (eye outline, whiskers, fur streaks) that depth smooths out.
- **Local contrast ("Detail boost").** `localContrast(gray, w, h, radiusPx, amount)`: subtract a large-radius Gaussian (≈ 1/12 of the shorter side), divide by a local standard deviation, soft-clip, `amount` 0 = off. Available for Brightness and Depth sources; default 0 for Brightness (unchanged output), 0.5 under Depth. It is what lets a flat-lit photo use the whole height range.
- **Range presets.** `Relief depth` presets Subtle / Portrait / Deep set `hmax − floor` and the profile bevel; they are data like the profile presets and show Custom when edited. Facial relief reads best with a modest range (about 1.5–3 mm over the plate) and a steep rim; the presets start there.
- **Persistence.** Like the matte of `33`: a `depth` record in `imageStore` keyed by `imageId` + model + revision, restored on load, kept when the model is deleted, dropped with the image; memory fallback with the `persistent` warning. If it is missing under `kind: 'depth'` the relief falls back to Distance with a "run again" message, never to an empty relief.
- **Not for shapes.** Shape mode has no image; the Photo-depth option appears only in Image mode, and only when the silhouette source is AI or the image otherwise has a usable mask (a depth relief outside a good mask is meaningless).
- **UI.** `ProfileSection`/Relief source: Distance | Brightness | Photo depth. Under Photo depth: model picker (depth models), Compute depth button with progress, the mix slider (Depth ↔ Detail), Detail boost, the existing contrast, gamma, invert and smoothing, the Relief depth presets, and a depth greyscale view (also in the enlarged mask dialog). Under Brightness: Detail boost appears.
- **Resolution warnings.** The existing `smoothResolution` and pattern resolution checks apply; a depth relief on a coarse grid gets a hint that a finer quality setting is needed for facial detail.
- **Performance.** Depth Anything V2 Small q4f16 is small; the PoC measures time and the backend it works on (WebGPU/WASM) per device. The run is cancellable and latest-wins like the matte.

## Risks / Trade-offs

- [Depth of a cat's fur and face is soft or wrong at edges] → the matte mask clips the edge, the rim roll-off hides the cliff, the mix adds detail; the PoC judges quality on the owner's cat photo before building.
- [Relative depth varies between photos] → normalised inside the silhouette; the user adjusts contrast, gamma, invert and range.
- [Fine detail is lost to the grid] → the quality setting and the existing resolution warning; a keychain-sized part cannot carry hair detail anyway, the portrait relief is about shape.
- [A second model (~20–50 MB) on top of the matte model] → shared manager and consent of `32`; both small.
- [External-data ONNX files need runtime support] → covered in the registry and tested in `32`'s runtime tasks (this change adds the case).
- [Printing a deep relief needs supports on steep faces] → the relief grows from a flat back (existing design), so it prints face up without supports; steep overhangs do not exist in a heightfield.

## Open Questions

- Whether depth alone is already good for a face or the brightness mix is essential: the PoC on the cat photo decides the default mix and boost.
- Depth Anything V2 Small versus V3 Small (Apache-2.0, 2026): compare quality and size in the PoC.
- Whether a face crop option (relief only inside a user-chosen window, with the rest flat) is wanted; left out for now.
