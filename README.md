<div align="center">

# ▦ PrintKit

**Parametric tools for 3D printing that run in your browser.**
Dial in a part, watch it appear in 3D, download an STL or 3MF, print.

No server. No account. No queue. Just real CSG running on your machine.

[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![three.js](https://img.shields.io/badge/three.js-preview-000?logo=threedotjs&logoColor=white)](https://threejs.org)
[![Manifold](https://img.shields.io/badge/manifold--3d-WASM-orange)](https://github.com/elalish/manifold)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## Why this exists

Gridfinity is an open standard, and I believe the tools for it should be free too: no accounts, no paywalls, no servers to trust. Everything here runs in your browser, so what you see is exactly what lands in the STL, with watertight meshes and no surprises in the slicer.

The other tools (keychains, rack parts, photo cutouts) are things I make for myself and use myself. I am simply sharing them.

## What you get

PrintKit is a set of products, each with its own modes. Every mode has a live 3D preview, remembers your settings, works in millimetres or inches, and exports binary STL or 3MF (with Bambu printer presets).

| Product | Modes |
| --- | --- |
| **Gridfinity Master** | **Box** (bin or tray with lip, scoop, dividers, magnets and screws), **Baseplate** (any grid, fractional cells, split to fit your bed, connectors, magnets and screws), **Cutout** (pockets from rectangles or imported STL parts) |
| **Keychain Master** | **Image** (a picture becomes a silhouette with a relief, patterns, text, ring mount, two printable halves with pins), **Shape** (a ready-made shape with a rim, the same patterns, text and mounts) |
| **Rack Master** | **Panel** (10-inch rack panel of 1–10 U with standard ear holes, Skadis, hexagon, pills, lines and opening patterns, optional separate back wall); **Enclosure** (front plate with ears and a shell around a device, with window, keystone sockets, holes and vents); a **Shelf** (front plate with ears, a ventilated floor and sloped side walls) |

Highlights:

- **Live 3D preview.** Change a number and the part rebuilds in a fraction of a second. Orbit it, zoom it, look underneath.
- **Real solid geometry.** The parts are built with the [manifold](https://github.com/elalish/manifold) CSG kernel compiled to WebAssembly, in a web worker, so the page stays responsive.
- **Print-ready export.** Printer bed overlay, parts laid out on plates, separate objects in 3MF.
- **Remembers you.** Settings persist in `localStorage`, per mode; units and language are shared.
- **English and Russian**, millimetres and inches.

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints, tweak, export.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type check, then production build into `dist/` |
| `npm test` | All tests (vitest) |
| `npm run art` | Regenerate the start page illustrations (see `CLAUDE.md`) |

## Deploy (GitHub Pages)

The app is a static site, so it deploys as plain files. `.github/workflows/pages.yml` does the work:

- **Every push and pull request:** the `verify` job runs `npm ci`, `npm test` and `npm run build`.
- **`main` only:** if `verify` passes, the `deploy` job publishes `dist/` to GitHub Pages. If tests or the build fail, nothing is published.

One-time setup: in the repository open **Settings → Pages** and set **Source** to **GitHub Actions**. After the first successful run on `main` the URL appears in the run summary and under Settings → Pages. A custom domain can be set on the same page.

The build uses relative asset URLs (`base: './'`) and hash routes (`/#/gridfinity/baseplate`), so it works from any subpath and a deep link opens that mode directly. Node 24 or newer is required (`engines` in `package.json`, `node-version: 24` in the workflow).

Renaming the repository is safe: GitHub redirects the old address, the Pages custom domain stays, and nothing in the build depends on the repository name. After a rename run `git remote set-url origin git@github.com:<user>/<new-name>.git` and update `GITHUB_URL` in `src/app/site.ts`.

## How it works

```
 params (React state, one per mode)
        │
        ▼
 geometry/*.ts ──► manifold-3d (WASM CSG, web worker) ──► parts (typed arrays)
                                                              │
                                      ┌───────────────────────┴───────────────┐
                                      ▼                                       ▼
                               Viewport.tsx                          export/ (STL, 3MF)
                            (three.js preview)
```

- Geometry is React-free and built from small profile and shape helpers that follow the standards (for Gridfinity: the 42 mm pitch, chamfers, 1.8 mm wall, 4 mm top radius, clearances).
- The worker returns plain typed arrays; the preview and the exporter read the same data, so they cannot disagree.
- The start page illustrations are pre-rendered from the real parts by a build script (`npm run art`), so the start page needs no WebGL.

## Project layout

```
src/
├── app/        # entry, hash router, shell, start pages, theme tokens, site config
├── ui/         # generic controls (NumberField, LengthField, Section, …) and units
├── features/   # one folder per mode (baseplate, box, cutout, keychain, …) and the viewport
├── geometry/   # all the CSG (manifold-3d), React-free
├── export/     # STL and 3MF, plate layout, printer presets
└── i18n/       # en / ru translations
```

Work is planned as numbered [OpenSpec](https://github.com/Fission-AI/OpenSpec) changes in `openspec/changes/` (order and dependencies in `openspec/ROADMAP.md`); `CLAUDE.md` describes the conventions.

## References

Standing on the shoulders of:

- [Gridfinity](https://gridfinity.xyz): the modular storage system by Zack Freedman and its community
- [gridfinitygenerator.com](https://gridfinitygenerator.com): the three Gridfinity modes and the set of parameters
- [gridfinity-studio](https://pandagao.github.io/gridfinity-studio): 3MF export and Bambu presets
- [tooltrace.ai](https://www.tooltrace.ai) and [aiprintgen.ru Gridfinity generator](https://aiprintgen.ru/gridfinity-generator): the photo-to-organiser flow (photo of tools on a sheet of paper, perspective alignment, silhouettes, a bin with fitted pockets)
- [Customizable vent blank panels for 10-inch rack](https://makerworld.com/ru/models/1872040-customizable-vent-blank-panels-for-10-inch-rack) (MakerWorld, Kiwiworks): rack panel patterns and options
- [10 inch mini-rack generator](https://makerworld.com/ru/models/1765102-10-inch-mini-rack-generator) (MakerWorld, spuder): enclosure options
- IKEA SKÅDIS pegboard: the slot layout of the Skadis panel pattern
- [19 inch vs 10 inch rack dimensions](https://commons.wikimedia.org/wiki/File:19_inch_vs_10_inch_correct_rack_dimensions.svg) (Wikimedia Commons): standard 10-inch rack dimensions
- [Keystone blank](https://makerworld.com/ru/models/1111789-keystone-blank) and [Keystone for other models](https://makerworld.com/ru/models/1135286-keystone-for-other-models) (MakerWorld): reference models for the keystone jack mount of the rack enclosure; only their dimensions were measured, no geometry is copied
- [openscad-agent](https://github.com/iancanderson/openscad-agent): an agent-driven workflow for printable models, an inspiration for building this with an AI agent
- [manifold](https://github.com/elalish/manifold): the geometry kernel; [three.js](https://threejs.org): the preview
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT): runs the optional neural networks in the browser

### AI models (optional)

The photo-to-cutout flow can use a neural network to find the tools on the sheet. The classic detector stays the default and needs no download. A model is downloaded only after you confirm it in the *AI models* window, is checked against a pinned SHA-256 and runs in your browser: photos are never uploaded. Only permissive licences are offered.

- [BiRefNet-lite 512 (fp16)](https://huggingface.co/studioludens/birefnet-lite-512) (MIT): the recommended model
- [ISNet general (fp16)](https://huggingface.co/imgly/isnet-general-onnx) (MIT): fast, needs WebGPU
- [ISNet general (int8)](https://huggingface.co/Ko033/isnet-general-use-onnx) (Apache-2.0): light
- [InSPyReNet SwinB (fp16)](https://huggingface.co/OS-Software/InSPyReNet-SwinB-Plus-Ultra-ONNX) (MIT): accurate, needs WebGPU
- [Depth Anything V2 Small](https://huggingface.co/onnx-community/depth-anything-v2-small-ONNX) (Apache-2.0): the depth map for the keychain photo relief, two files (graph and weights)

## License

[MIT](LICENSE). Print it, remix it, ship it.
