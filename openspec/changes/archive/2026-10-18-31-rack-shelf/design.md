# Design

## Context

`26-rack-panels` has `plateBase` (outline with corner radius, height tolerance and ear holes, in the XY plane with x from the panel centre and y from its lower edge), `rackLayout` and the patterns (`cutPattern(w, pattern, region)`, `patternIssues`); `28-rack-enclosures` shows how a mode adds `ModeParams`, a `generate` case, a migration and a Rack chooser card, and how the front face is put on z = 0. The shelf is a union of a plate lying on the bed with a floor and two side walls standing on it. A first, flat-slab version of the mode exists in the repository (committed, not archived) and is replaced by this design.

## Goals / Non-Goals

**Goals:**
- A shelf shaped like the owner's reference (perforated floor, straight-sloped side walls), printed with the front face on the bed without supports.
- The same plate, ears and tolerance as the other Rack modes, and the same patterns.

**Non-Goals:**
- Gridfinity, holes in the side walls, a back wall, ribs, shelves above the lower edge.

## Decisions

- **Frame (print orientation).** Bed is z = 0, like the enclosure: the plate is `plateBase` extruded 0…`thickness` in the XY plane (x from the centre, y from the lower edge, front face down at z = 0, back face at z = thickness). The shelf stands on the back face: the floor is a slab `width × floorThickness` in the XY plane at y = 0…floorThickness (flush with the plate's lower edge) extruded from z = thickness − 0.01 up to z = thickness + depth. The side walls are prisms standing on the floor edges (below). The model is built directly in this frame, no mirror and no rotation, so the export needs no flipping.
- **Floor at the lower edge only.** The floor's outer face is flush with the plate's lower edge; a raised floor would be a different part. No level setting.
- **Width.** `shelfWidth = 222.25 − 2 × clearance` (default 0.25 mm), centred; the plate's rounded lower corners do not touch the floor.
- **Side walls.** Two walls of thickness `wall` (default 3 mm) standing on the left and right edges of the floor, inside its width. Each wall is a polygon in the (y, z) plane extruded across its thickness: from the plate's back face (z = thickness) to the back of the shelf (z = thickness + depth), tall `sideHeight` above the floor's outer face at the plate (so up to y = sideHeight) and falling in a straight line to the floor's top (y = floorThickness) at the back. `sideHeight` 0 means no walls; it is limited to the plate height. The walls overlap the floor by 0.01 mm and the plate by 0.01 mm so the solid is one piece. No holes in the walls.
- **Floor pattern.** `floor.pattern: PatternParams` (the same structure as the panel's pattern, one of the existing kinds including `none`). The pattern region is the floor's rectangle in x and z (width inside the walls, depth), laid out by `cutPattern` with the margin; the cut is extruded through the floor thickness. Default: kind `pills`, tuned so the slots read like the reference (long slots running across the shelf, brick offset); `none` makes a solid floor. The pattern never cuts the walls: its region excludes the wall footprints.
- **Open front.** `closedFront` (default false): the plate outline loses a rectangle from the floor's top to above the plate's top edge, between the side walls (the full floor width when the walls are off); ears, the strip at the floor and the wall footprints remain, and the part stays one solid through the floor and the walls. A closed front keeps the whole plate.
- **Plate pattern.** Only for a closed front. `platePattern: PatternParams`, default `none`. The region is the plate area above the floor and inside the rails (x ±(111.125 − margin), y from floorThickness + margin to plateHeight − margin); a plate pattern needs height, so it reports `rack.error.region` when the region is empty (1 U with a thick floor). The ear holes keep their standard places outside the window.
- **Connectivity.** A pattern that splits the floor or the plate into loose pieces is rejected with `rack.error.disconnected`, as for panels; `patternIssues` gives the thin-wall warnings for both patterns.
- **Validation keys** (`rack.error.*`): units 1–10, plate thickness 1.5–8, floor thickness 1.5–10 and well below the plate height, depth 20–400, clearance 0–2, wall 0.8–10, side height 0–plate height, ear size as for panels, pattern margins.
- **Mode plumbing:** `ModeParams.rackShelf`, `generate('rackShelf')` returns one part `shelf`; path `/rack/shelf`, key `rack.shelf`, a migration normalising nested objects. The stored `lips` of the first draft are dropped, `shelf`, `ears` and the numbers keep their meaning. The Rack chooser card art `rackShelf` is redrawn (2 U shelf with sloped sides and the slotted floor).
- **UI sections:** Plate (units, thickness, corner radius, tolerance, the plate pattern block), Shelf (depth, floor thickness, clearance, side wall height and thickness, the floor pattern block), Ears (shared). The pattern controls of the panel mode (`PatternSection`) become a component that edits a `PatternParams` and is used by the panel, the floor and the plate; the panel keeps its look. `LengthField` for lengths, `NumberField` for units; summaries and changed highlights as in the other modes; no artboard, built from the components.

## Risks / Trade-offs

- [A deep shelf exceeds the printer bed] → the export panel already reports the fit; splitting is out of scope.
- [A thin floor standing 100 mm tall on a 3 mm plate is a weak joint, and its layers lie across the load] → the floor and the side walls tie into the plate and into each other, the sloped walls act as gussets; the help text says so and a thicker floor or plate is a setting.
- [The floor pattern can split the part] → rejected with `rack.error.disconnected`, and the default pattern is chosen to leave a rim.
- [The plate pattern on a 1 U plate has little room] → the region error and the pattern default `none`.

## Open Questions

- The default floor pattern is a guess from the picture (slots across the shelf); adjust after a look at the render.
