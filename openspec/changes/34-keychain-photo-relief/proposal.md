# Proposal

## Why

With `33-keychain-ai-silhouette` a photo gives a clean outline, but inside the outline the keychain is still a plain bevelled plate. A portrait of a cat (or a person, or a pet's face) is only recognisable by what is inside the outline: the eyes, the nose, the ears, the fur pattern. The owner tried exactly this: the outline of the cat is good, but the face cannot be seen on the keychain, so there is little point in working from photos.

The relief already has a "brightness" height source, but it does not solve this: the brightness of a photo is lighting, not shape (a dark stripe on fur becomes a groove, a bright cheek a bump, a shadow a hole), and a flat-lit photo has too little tonal range inside the subject. What a face needs is shape: the nose proud of the cheeks, the eyes sunk, the ears leaning away. A monocular depth network gives a relative depth map from a single photo and runs in the browser; Depth Anything V2 Small (Apache-2.0) is 20–50 MB. The research and application notes (`tmp/ai/BROWSER_AI_APPLICATION.md`, idea A3) planned it for this purpose. Together with the soft matte of `33` this gives a bas-relief portrait.

## What Changes

- **Depth as a height source.** In Image mode the Relief source gets a third option, "Photo depth" next to Distance and Brightness. The depth map is computed once by a model from the model manager of `32`, stored with the image, and used inside the AI silhouette as the height field, with the existing contrast, gamma, invert and smoothing controls.
- **Mix with brightness.** A slider mixes depth with local-contrast brightness (0 % = depth only, 100 % = brightness only), because depth gives the form and brightness the fine detail (whiskers, fur, eye outline). The default favours depth.
- **Local contrast.** The brightness source gets an optional "Detail boost" (local contrast normalisation) so that a flat-lit photo reaches the tonal range the height needs; also useful for the plain Brightness source.
- **Range and base.** The height range of the photo relief, its floor and the rim stay the existing relief controls; a "Relief depth" preset (Subtle, Portrait, Deep) sets sensible range values. Printing notes: very fine detail below the grid cell is limited by the quality setting, as the existing resolution warning says.
- **Persistence.** The depth plane is stored with the image like the matte of `33`, keyed by image, model and revision, so a reload restores the relief without running the network.
- **PoC.** `poc/ai/` can run the depth model (kind `depth`, with external weights) on the owner's cat photo and shows the depth map next to the image, so the quality is judged before the work starts.

## Capabilities

### New Capabilities
- `keychain-photo-relief`: depth-based relief from a photo, its mix with brightness, local contrast and persistence.

### Modified Capabilities

## Impact

- `geometry/keychain.ts` (`SourceParams.kind` gets `'depth'`, plus `depthMix`, `boost`; `buildGrid` takes the depth plane through the same path as brightness: resample to the grid, contrast/gamma/invert/smoothing, clamp to the silhouette; `registerDepth` and `depthRegistry` in the worker), `geometry/raster/` (`localContrast`, depth normalisation), `features/keychain/` (`ProfileSection` source choice, `PhotoReliefBlock`, `useDepth`, depth records in the store, migration), reuse of `src/ml/` and the model manager of `32` (a second model kind in the registry, `kind: 'depth'`, with external data support), strings in en and ru, tests.
- With `kind: 'distance'` or `'brightness'` and `boost: 0` the output equals the current one.
- Out of scope: real metric depth, 3D reconstruction, per-region editing of the relief or a sculpt brush, normal maps, colour output or multi-colour printing, face-specific models, Shape mode.
- Version 1.5.0 (minor: a new relief source).
- Depends on: `33-keychain-ai-silhouette`, `32-photo-trace-ai`, `12-keychain-patterns`, `17-keychain-smoothing`, `29-beta-label`.
