# Design

## Context

`decodeImage` returns `GrayImage {gray, alpha | null}`; the image is stored in IndexedDB and registered once in the worker (`imageRegistry`), params reference it by `imageId`. `buildSilhouette(img, s)` calls `toMask`, which uses `alpha ≥ 128` when the image has transparency, otherwise a brightness threshold; closing, area detection, specks and grow follow. `32-photo-trace-ai` provides `src/ml/` (worker, client, registry with pinned models, per-model backend and `maskDefaults`), the model manager and the mask-tuning maths (smoothing then threshold on a soft alpha).

A keychain differs from a photo cutout in three ways that shape the design: the input is an arbitrary image (any aspect ratio, up to 4096 px) and not a rectified sheet; the result is one subject for one piece of printed plastic; and the silhouette is later sampled on a grid of 0.2–0.5 mm cells, so edge accuracy is far less critical than for a pocket that must fit a tool (a 50 mm keychain over a 1024 px matte is 0.05 mm per pixel).

## Goals / Non-Goals

**Goals:**
- Photo in, clean silhouette out, without leaving the app, with the same two controls and models as `32`.
- Brightness stays the default and unchanged; no image or mask leaves the browser.
- Reloading restores the same silhouette without running the network.

**Non-Goals:**
- Editing the mask by brush, selecting objects by click, depth relief, Shape mode.

## Decisions

- **Soft matte as a stored plane, silhouette computed in the worker.** The main thread runs the network (the `32` client) and gets a soft alpha at the image's resolution (0–255, `Uint8Array`). It is registered once in the worker (`registerMatte`, registry `matteRegistry` like `textRegistry`) and params carry `silhouette.ai.matteId`. In `buildSilhouette`, when `source === 'ai'` and the matte exists, the image's alpha is replaced by `smoothThreshold(matte, ai.smooth, ai.threshold)` and the existing path (`toMask` alpha branch, close, areas, specks, grow) runs unchanged. Moving a slider therefore only rebuilds the silhouette in the worker, never re-runs the network, and the matte is not re-sent. Alternative: send a ready hard mask on each slider move. Rejected: re-registers megabytes per move and breaks the "params reference ids" convention.
- **Input to the network.** The whole image, long side capped at 2048 for inference (the stored image keeps its own size, ≤ 4096), fitted into the model's square input with the aspect ratio kept and the borders filled with the model's mean colour (the PoC "whole image" mode does exactly this); the output is cropped back and resampled bilinearly to the image size. The paper-sheet stretch used in `32` is not appropriate here. No hybrid edge: the resolution argument above makes it unnecessary, and the brightness image is not a reliable edge cue for photos.
- **Soft alpha semantics.** The matte keeps the network's probability, so the two controls mean the same as in `32`: threshold decides how far the outline reaches into the soft edge (default per model, 0.5 as a fallback), smoothing radius is a length in image pixels converted from mm of the keychain size (`LengthField`, mm of the final keychain, so the same value gives the same visual smoothness at any resolution). Defaults come from `maskDefaults` of the model.
- **Keep only the largest object.** A component filter after the threshold keeps the connected component with the largest area (8-connected, `labelComponents`) and drops the rest; enclosed gaps are untouched and become areas as before. Default on for AI, off for Brightness (where several shapes can be intentional, e.g. a logo with a separate dot). Stored as `ai.keepLargest`.
- **Persistence.** `imageStore` records get a second kind of entry, `matte`, keyed by `imageId` + `model` + `revision`, with the plane and its size; stored together with the original in the same DB (`gridfinity-keychain`), memory fallback with the existing `persistent` warning. The params store `source`, `ai.model`, `threshold`, `smooth`, `keepLargest`; on load the matte is read and registered. Deleting the model in the manager does not delete the matte; deleting or replacing the image does. If the matte is missing (cleared storage) the section shows "run again" and the silhouette falls back to Brightness until it is run, never to an empty mask.
- **Staleness.** The matte is tied to the image and the model: replacing the image drops it; choosing a different model keeps the old matte until the user runs the new one (shown as "matte from <model>"), so a switch never silently re-runs a download-sized job.
- **Relation to existing alpha.** If the image already has transparency, the section shows the note "this image has transparency, it is used as is" with AI still selectable (the user may want a different cut), and the AI run ignores the image's alpha as input. SVG is rasterised by the existing path and is not offered AI.
- **UI.** `SilhouetteSection` gets `SegmentedControl` From: Brightness | AI. Under AI: model picker (from the manager, with a link to open it), the Remove-background button (disabled with the hint "Download a model to use AI" and a link to the manager while no model is ready, active as soon as one is) with the shared `AiStatus` next to it (spinner, the current line of the log, Cancel; the full log is in the shared activity log opened from the status bar), the shared `MaskTuning` block (edge reach, smoothness, per-model defaults, reset, soft-matte greyscale view, which can also open in the enlarged mask dialog), the keep-largest toggle and the hints. Brightness controls (threshold, invert) are hidden under AI because they have no effect there; close, fill holes, specks and grow stay, since they work on the resulting mask. The mask preview, areas and everything downstream read the resulting silhouette as today.
- **Hints.** After a run, if the image has more than 2 distinct dominant colours in the border band the hint is silent; if the image is nearly two-tone (a logo on a clean background: Otsu separability high, a border band of one colour) a hint says Brightness is usually better and quicker. Pure text, never blocks.
- **Performance.** The run is a few seconds to ~20 s depending on model and backend (see `FINDINGS.md`); the dialog shows progress, the panel stays usable, a new run cancels an old one (latest wins via the client). Huge images are capped for inference only.
- **Versioning of params.** `migrateKeychain` fills `source: 'brightness'` and the `ai` defaults for old records, so stored keychains are unchanged; with `source: 'brightness'` the pipeline output equals the current one (regression volumes in the existing tests).

## Risks / Trade-offs

- [The network picks the wrong subject or several subjects] → keep-largest handles stray bits; a different model or the controls help; click-to-select is a later change.
- [Fine details (fur, hair, thin chains) are lost or merged] → smoothing 0 and a lower threshold keep them; the grid cell limits the final detail anyway; the soft matte view shows what the network saw.
- [A 1024 px matte of a 4000 px photo is soft] → fine for a 0.2–0.5 mm grid on a keychain-sized part; the matte is upsampled bilinearly, not with fake detail.
- [Large downloads] → handled by the shared model manager and consent of `32`; a keychain run uses a model that may already be there from Cutout.
- [WebGPU-only models on devices without WebGPU] → the picker marks them unavailable with the reason (capability detection of `32`) and offers WASM models.
- [Storage growth] → a matte is about the size of the image's gray plane (≤ 16 MB at 4096²); stored once per image and model, removed with the image; memory fallback if storage is refused.

## Open Questions

- Whether the default model for Keychain should differ from the Cutout default (photos of animals and people versus tools on paper); the PoC "whole image" mode and a few pet and portrait photos from the owner decide it.
- Whether to offer a one-click "AI remove background" on import for images that look like photos (no transparency, busy border), or keep it manual. Starting manual.
