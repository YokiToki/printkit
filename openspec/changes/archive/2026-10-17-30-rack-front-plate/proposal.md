# Proposal

## Why

The front plate of the enclosure (change 28) cuts a bare rectangle for each keystone jack. A rectangle of the module's size does not hold a module: the real jack snaps in behind the plate with a latch, and the sample outlet frame the owner supplied has a deep socket with a ramp and a latch notch for exactly that. The openings are also placed too rigidly (a single column beside the shell or one row below), "cable holes" is a misleading name for holes that can serve any purpose, that block has no heading, and the closed front plate must be an option rather than the way to get a front plate with windows.

## What Changes

- **Keystone mount.** A keystone opening becomes a socket that holds the module: an opening with the ramp and the latch notch, and a collar behind the plate so the module has depth to snap into. The profile is taken from the sample models (see the design); the plate alone is too thin to hold a module.
- **Window by default.** The window on the device front stays the default; the closed plate remains an option (a switch), as before.
- **Flexible placement.** The front plate gets a list of opening groups instead of the single keystone setting and the cable-hole setting. A group is a kind (keystone socket or round hole), a count, how many per row (one gives a column, all gives a row, anything between a grid), and a zone (left or right of the shell, above or below it). Several groups can be added, so keystones and holes can sit one above another, in a row or in a grid, on any side.
- **Naming.** The "cable holes" are renamed "holes" (they can be for a cable, a button, a screw or anything else) and the block gets its own heading, like the window and keystone blocks.
- **Version 1.1.0** (minor: a new keystone mount and new placement options).
- **References.** The two MakerWorld models and the sample drawing the design is based on are listed in the README references.

## Capabilities

### New Capabilities

### Modified Capabilities
- `rack-enclosure`: keystone openings become mounts, openings are placed in groups, the window is the default and the closed plate an option.

## Impact

- `geometry/rack/case.ts` (the opening groups replace `keystones` and `cable`, with a migration from the old fields), a new `geometry/rack/keystone.ts` (socket profile and collar from the measured sample), `spec.ts` constants, `features/rack/CaseFrontSection` and strings in en and ru, art if the card render changes, tests.
- Out of scope: keystone modules themselves and blanks as printable parts (the models are reference, not assets), other jack standards, labels, a keystone mount for the panel mode, bin-style stacking of whole racks.
- Depends on: `28-rack-enclosures`, `29-beta-label` (the versioning rule).
