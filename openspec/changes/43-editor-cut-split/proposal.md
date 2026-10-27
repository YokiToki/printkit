# Proposal

## Why

Two of the most common reasons to open a model in an editor before printing are "it does not fit on my bed" and "I need a hole for a magnet/screw/insert here". Slicers have a Cut tool, Meshmixer has Plane Cut, and Gridfinity Baseplate already splits plates with connectors (`06`, `06a`) — but only for its own grid. This change brings the same capabilities to any model: cut with a plane, split to the printer bed, join the parts with pins or dovetails, drill fastener and magnet holes anywhere on a surface, and put text on a face.

## What Changes

- **Plane Cut.** A cutting plane defined by an axis and position, by the gizmo (any orientation), by a picked flat face, or by three points. Modes: keep both parts (as separate objects), keep one side, slice into N equal parts along an axis. The parts are *derived*: they keep a reference to the source object and the cut definition, so editing the plane or the source updates them (rule 2a). The cut faces are capped automatically (closed solids).
- **Split to bed.** One command computes the cuts needed so every part fits the printer bed of the export settings (bed minus margin), spread evenly, with a per-axis override and manual adjustment of each cut position; parts are labelled A1, B1… like the baseplate.
- **Connectors on cut faces.** Alignment pegs (cylindrical peg + socket with clearance), through-holes for filament or pins, magnet pockets, and dovetails, using the presets of `06a` (filament 1.75 → Ø1.9, pins 2/3 mm, magnets 3 × 2 and 2.8 × 0.75, dovetail clearance). Placement is automatic over the cut section (inset, even spacing, never closer than a margin to the outline) with click-to-move, add and remove in the preview; each connector is checked to lie inside both parts for its full depth.
- **Hole tool.** Click a surface to place a hole along the surface normal: simple, counterbore, countersink, magnet pocket, screw clearance and heat-insert pocket (M2–M5 and common magnet sizes from presets, with tolerance), blind or through, offsets typed numerically, arrays through the patterns of `41`. A hole is a stack operation with a stored position in object-local space.
- **Text on a face.** Emboss or engrave text at a picked surface point with font, size, spacing, depth/height and rotation, using the font list and rasteriser of Keychain (`19`) and the exact outline tracing, as a stack operation.
- **Plan checks.** Parts that still exceed the bed are marked; connectors that collide or leave a part produce warnings with keys, like the baseplate's `connector.*`.

## Capabilities

### New Capabilities
- `editor-plane-cut`: Plane Cut, split to bed, derived parts.
- `editor-cut-connectors`: pegs, pins, magnets, dovetails on cut faces, placement and checks.
- `editor-holes-text`: hole tool with presets and text on faces.

### Modified Capabilities

## Impact

- New `src/geometry/cut/{plane,split,section,connectors,place}.ts` (reusing `PRESETS`/clearance constants of `connectors.ts` and `fasteners.ts` through a shared module), `src/geometry/features/ops/{hole,text}.ts`, doc field `cuts` (`CutGroup`), derived-part object source `{kind:'cutPart', group, index}`, `features/editor/{CutTool,SplitDialog,ConnectorEditor,HoleTool,TextTool}`, viewport support for the cutting plane widget and surface picking markers, strings, tests.
- Reuse: `Manifold.trimByPlane/splitByPlane`, `CrossSection` of the cut, `rasterizeText` and `textOutline` of Keychain (moved to shared modules if they are feature-private), `usableBed` and printers of `09`.
- Out of scope: cutting with curved or sketch-shaped surfaces (cut tool = a Boolean with a tool object, available from `41`), automatic best-cut search that avoids features, interlocking joints beyond pegs and dovetails, threads (real helical threads), text along curves or wrapped on curved surfaces (flat projection only), per-part colours, assembly animation.
- Version 1.14.0 (minor: a new capability).
- Depends on: `41-editor-op-stack` (stack operations, booleans, patterns, closed-solid guard) and `42-editor-mesh-repair` (planar face region for plane-from-face and surface picking).
