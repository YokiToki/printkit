# Proposal

## Why

The photo-to-cutout flow (`25`, `25a`) finds tools on a sheet of paper with a hand-tuned colour segmenter: a paper-colour model, a shadow-region growth and a hole fill. On the owner's two reference photos (`geometry/photo/fixtures/{flash,noflash}.jpg`) it works, but it is a pile of heuristics with known weak spots: dark parts that merge with their own shadow, objects close to the paper's colour, tools that touch and merge into one silhouette, glossy plastic and glass. Every new photo style needs new thresholds.

Neural segmentation answers the question the heuristics approximate: "which pixels are the object". Models for salient-object matting and promptable segmentation run in the browser (ONNX Runtime Web / Transformers.js, WASM or WebGPU) and do not send the photo anywhere. The research is in `tmp/ai/BROWSER_AI_RESEARCH.md` (model catalogue) and `tmp/ai/BROWSER_AI_APPLICATION.md` (where to apply it); the preprocessing notes in `tmp/ai/PREPROP_CUTOUT_*.md` come to the same conclusion: use the network for "what", and keep a precise edge from classical code, because the requirement is 0.5 mm on size.

The AI path is an **alternative**, not a replacement. The current segmenter stays exactly as it is and stays the default (the baseline): it works offline, needs no download and is the reference the AI result is measured against.

## What Changes

- **Engine choice on the silhouette step.** A control "Detection: Classic | AI" in the photo dialog. Classic is the default and is today's behaviour, untouched. AI is optional and needs a one-time model download with the user's consent. The choice is kept for the session with the rest of the dialog state.
- **AI silhouettes (automatic).** The straightened sheet (`rectify`) is run through a background-removal network; the foreground mask is cleaned (threshold, close, fill holes, edge margin, specks, connected components) into the same `Segmentation` the classic path produces, so selection, outline tracing, cutout creation and everything after it are shared.
- **Hybrid edge.** The network decides which pixels belong to an object; the exact edge comes from the classical code: a band of 1–2 mm around the network's mask is searched with the existing paper-colour test and sub-pixel `traceAlpha`. Where the classic test finds nothing in the band (a dark part merged with its shadow) the network's own edge is used. Result: the 0.5 mm scale accuracy of the baseline wherever the baseline is accurate, and the network's judgement where it is not.
- **Compare view.** A switch that shows the classic and the AI silhouettes over the straightened sheet (outline of the other engine as a dashed line), with the size of each silhouette in mm for both, so the user can pick the better result per photo.
- **ML runtime.** A separate worker (`ml.worker.ts`, not the Manifold worker), a client with "latest request wins" like `modelClient.ts`, a model manager, backend choice WebGPU → WASM, weights from a pinned Hugging Face revision. All UI text in en and ru.
- **Model manager (a modal of its own).** Opened by a button in the top bar of the app, always available and independent of any mode, so models can be downloaded or deleted at any time. Models are in sections by kind (silhouette mask, depth); each shows size, licence and status, with Download and Delete. A model is **never downloaded silently**: only after an explicit confirmation in the manager. The AI run button is disabled while no suitable model is ready, with a hint to download one, and becomes active when the download finishes.
- **AI activity and log.** While a model downloads or an AI run is going on, a loader and the **current line of the log** (what is happening now, for example "Downloading model: 42 of 98 MB", "Starting session (WASM)", "Object 2 of 3, second pass") are shown next to the run button, and every line also goes to the **shared activity log of the app** (`31a-status-log`): the status bar shows the same current line and opens the full log, so there is no separate log in the model manager (it only has a link to it).
- **Evaluation harness.** A spike script that runs the baseline and every candidate model on the fixtures and prints per-silhouette IoU and size error in mm; the model for the default AI engine is chosen from its output (task 1), not from the catalogue.

## Capabilities

### New Capabilities
- `cutout-photo-ai`: the optional neural silhouette engine for photo cutouts, the unchanged classic baseline, the hybrid edge, the compare view, and the model download and privacy rules.

### Modified Capabilities

## Impact

- New `src/ml/` (React-free adapters `matte(image) → alpha`, runtime, model registry with pinned revisions and licences, cache), `ml.worker.ts` and `mlClient.ts`; new pure code `geometry/photo/ai.ts` (mask → `Segmentation`, hybrid edge band) next to `segment.ts`, which is **not edited**; `features/cutout/photo/` gets `EngineSwitch`, `ModelDialog`, `CompareOverlay` and `usePhotoTrace` gains the engine state and an AI segmentation next to `segmentation`; `app/` or settings gets the model manager entry; strings in en and ru; the References page lists every model with its SPDX licence and source; tests (post-processing on stored model outputs, baseline regression, component tests with a mocked `mlClient`).
- New dependency on an inference library (`onnxruntime-web` or `@huggingface/transformers`, chosen in task 1); weights are not committed and not bundled (100 MB limit of GitHub Pages), they are fetched on demand.
- The classic path's outputs on both fixtures stay byte-identical (checked by an existing test and a new frozen-output test).
- Out of scope: click-to-select / positive and negative points with a promptable model (SAM), a follow-up change once the automatic path is measured; depth maps, background removal for Keychain, prompt-to-parameters and other ideas from `BROWSER_AI_APPLICATION.md`; any server-side inference; non-commercial weights (RMBG-1.4/2.0, Depth Anything Base/Large) and AGPL code (Ultralytics); multi-threaded WASM (needs COOP/COEP headers that GitHub Pages does not send); offline pre-download of models; changing the classic segmenter.
- Version 1.4.0 (minor: a new option).
- Depends on: `25a-photo-trace-improvements`, `29-beta-label` (the versioning rule), `31a-status-log` (the shared activity log).
