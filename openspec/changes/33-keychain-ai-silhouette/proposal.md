# Proposal

## Why

Keychain Image mode builds its silhouette from a threshold (Otsu or manual) on brightness, or from the alpha channel when the image has one. A logo on a white background works. A photo (a pet, a face, an object on a table) does not: brightness cannot tell the subject from the background, and the user fights the threshold, closing and areas without getting a clean outline. The usual answer is to remove the background first in some other tool and import a PNG with alpha.

`32-photo-trace-ai` adds a browser-side neural engine for photo cutouts: an ML worker, a model manager, permissive-licence models and the two mask controls (threshold and smoothing). The same machinery produces exactly what Keychain needs, a soft alpha of the main subject, and the pipeline already has a place for it ("alpha wins"). This change connects them, so a photo becomes a keychain without leaving the app.

## What Changes

- **Silhouette source.** In Image mode the Silhouette section gets a choice "From: Brightness | AI". Brightness is today's behaviour, untouched and the default. AI removes the background with a model from the model manager of `32`.
- **Remove background (AI).** A button runs the network once on the whole image (aspect kept, padded to the model's input), shows progress, and stores the soft alpha ("matte") next to the image. The original image is kept; switching back to Brightness needs no new image.
- **Mask controls.** The same two user-facing controls as in `32` (edge reach = threshold, outline smoothness = smoothing radius) turn the stored soft matte into the silhouette. Changing them re-evaluates the mask without running the network. Defaults are per model (`maskDefaults` of the registry).
- **Keep the main object.** An option "Keep only the largest object" (on by default for AI) drops the stray bits a network sometimes leaves in the background; enclosed gaps stay and remain *areas* as before.
- **Persistence.** The matte is stored in IndexedDB with the image (`imageStore`), keyed by image, model and revision, so a reload restores the same silhouette without the network, and removing the model from the manager does not break an already computed matte.
- **Hints.** A transparent PNG keeps using its own alpha (AI is offered but not suggested); a logo on a clean background gets a hint that Brightness is usually better. SVG is not offered AI.
- **PoC.** `poc/ai/` has a "whole image (Keychain)" mode with padding, so models can be checked on keychain pictures before the work starts.

## Capabilities

### New Capabilities
- `keychain-ai-silhouette`: the AI silhouette source for Keychain Image mode, its mask controls, persistence and hints.

### Modified Capabilities

## Impact

- `geometry/keychain.ts` (`SilhouetteParams` gets `source: 'brightness' | 'ai'` and `ai {model, threshold, smooth, keepLargest}`; `buildSilhouette` builds the alpha from the registered matte, then the unchanged pipeline), a matte registry in the worker next to `imageRegistry` (`ModelClient.registerMatte`, params carry `ai.matteId`), `features/keychain/` (`SilhouetteSection` source switch, `AiSilhouette` block, `useMatte`, `imageStore` matte records, migration normalising the new fields), reuse of `32`'s `src/ml/`, `ModelManager`, `MaskTuning`; strings in en and ru; tests.
- With `source: 'brightness'` the output equals the current one (regression volumes kept).
- Out of scope: Shape mode (no image), depth maps as a relief source, click-to-select or erase/restore brush on the mask, several subjects as separate keychains, background replacement or colour output, upscaling small images, any new model beyond the registry of `32`, Rack and other products.
- Version 1.4.0 (minor: a new option).
- Depends on: `32-photo-trace-ai` (ML runtime, model manager, mask tuning, registry), `11-keychain-relief`, `29-beta-label`.
