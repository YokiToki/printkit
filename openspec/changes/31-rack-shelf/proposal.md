# Proposal

## Why

A 10-inch rack often needs a plain shelf: something to stand a router, a power brick or a small box on, in the place of a unit. The enclosure mode wraps a device, the panel mode is flat, and nothing in Rack Master carries a load. A shelf is a front plate with the standard ears and a shelf behind it. It deliberately has nothing to do with Gridfinity, so the two products stay separate.

The first version of this change (a flat slab on the bed with a standing plate and edge lips, committed but not archived) was not what the owner wants. The reference is a sheet-metal rack shelf: a perforated floor, two side walls that slope straight down from the front plate, and optional ventilation in the front plate. The shelf must print like the enclosure, with the front face on the bed.

## What Changes

- **Shelf mode** in Rack Master (route `/rack/shelf`, third card on the Rack chooser, hotkey 3). It generates one part: a rack front plate with the standard ears, a shelf floor behind its lower edge and two side walls.
- **Shape (from the owner's reference pictures, simplified).** The floor is as wide as the window between the rails less a clearance and as deep as chosen. The side walls stand on the floor edges, as tall as chosen at the plate and sloping in a straight line down to the floor at the back; they are plain, with no holes. There is no back wall.
- **Print orientation.** The front face of the plate lies on the bed (z = 0), exactly as for the enclosure; the floor and the side walls grow upward from it. The export needs no flipping.
- **Floor ventilation.** The floor is not solid by default: it carries a through pattern (slots, from the existing patterns of the panel mode), and a solid floor is an option (pattern "none"). The default pattern is pills (slots), as in the reference.
- **Open front by default.** Like the reference, the plate is open above the floor between the side walls (ears and a strip at the floor remain); a closed plate is an option, and only a closed plate can carry a ventilation pattern (off by default).
- **Default size 1 U** (side walls 35 mm at the plate).
- **Settings:** plate height in rack units (default 1), plate thickness, shelf depth (default 100 mm), floor thickness (default 3 mm), clearance to the rails (default 0.25 mm each side), side wall height at the plate (default most of the plate height, 0 = no side walls) and wall thickness, the floor pattern and the plate pattern, plate corner radius, height tolerance and the ear holes shared with the panel mode.

## Capabilities

### New Capabilities
- `rack-shelf`: a 10-inch rack front plate with a shelf, sloped side walls and optional ventilation.

### Modified Capabilities

## Impact

- `geometry/rack/shelf.ts` is rebuilt (plate lying on the bed, floor and sloped sides standing on it, patterns cut through the floor and the plate) and reuses `plateBase` and `cutPattern` / `patternIssues` of the panel mode; `geometry/model.ts` (`rackShelf`, already present); `features/rack/` (`ShelfPanel` rewritten, `PatternSection` made independent of the panel params so the three places share it, migration extended with the new fields); art `rackShelf` redrawn (`npm run art`); strings in en and ru; tests.
- Out of scope: Gridfinity baseplates or bins (this replaces the earlier rack-gridfinity-tray idea), holes in the side walls, a back wall, ribs, a shelf above the plate's lower edge, drawers and rails, splitting a deep shelf for small printers.
- Version 1.2.0 (minor: a new mode; the earlier draft of the mode was never released, so the version is unchanged).
- Depends on: `26-rack-panels`, `29-beta-label` (the versioning rule).
