# Design

## Context

`geometry/rack/case.ts` has `frontExtras` (a column of keystone rectangles beside the shell or a row below it, plus up to two round holes) and `frontCut`. The owner supplied two MakerWorld models and a dimension drawing in `tmp/keystone/` (git-ignored samples, not copied into the repository): a keystone blank (a plug, 21.9 × 19.0 × 16.0 mm bounding box) and `EthOutlet1X`, a wall-outlet frame that holds one module. The README lists the two model pages as references.

## What the samples say

Slicing the outlet frame along its depth (z = 0 at the face) gives, in millimetres:
- an outer flange 22.75 × 31.44 for the first ≈ 2.4 mm, then a body 19.8 × 27.85 up to 10.4 mm deep;
- a through opening 14.8 wide and ≈ 16.6 tall at the face;
- a latch notch: between about 5.8 and 8.3 mm deep the opening grows 1.6 mm on one long edge;
- a ramp on the opposite edge: that edge moves out from the face to ≈ 5.3 mm further over the first ≈ 7.5 mm of depth, so the module's latch rides up and drops into the notch.
The module drawing shows a body about 14.25 × 16 with latch tabs reaching 17.3 and an overall height of 19.75–20.75 mm.
These values are measured, not copied geometry; the task records the exact numbers in `rack/spec.ts` with the source named, and the first task re-slices the files to confirm them.

## Goals / Non-Goals

**Goals:**
- A socket that holds a real module.
- Placement that covers a column, a row and a grid on each side.

**Non-Goals:**
- Printing modules or blanks, other jack types.

## Decisions

- **Socket = opening + collar.** For each keystone: the plate opening of the measured width and height with its ramp and notch cut as a pocket in a collar of the outlet's body size (≈ 19.8 × 27.85) that is added behind the plate for the socket depth (≈ 8 mm behind the plate). The collar is unioned to the plate and the pocket profile is subtracted; the plate is the flange. The collar grows into the space behind the plate beside the shell, so it must stay clear of the shell, the ears and neighbouring collars; the layout uses the collar outline, not only the opening, to check fit.
- **Layout footprint.** Keystone pitch in a row is the collar width plus a gap (≈ 21 mm); in a column it is the collar height plus a gap (≈ 29 mm). The old 19 mm pitch is wrong for sockets and is replaced; a simple grid keeps the module spacing real.
- **Opening groups.** `openings: OpeningGroup[]` with `{ kind: 'keystone' | 'hole', count, perRow, zone: 'left' | 'right' | 'above' | 'below', diameter? }`. `perRow = 1` is a column, `perRow >= count` a row, in between a grid filled row by row and centred in the zone. Zones are the free plate areas beside the shell (left, right) and above or below it when the plate is taller than the shell. Groups in the same zone are placed one after another from the zone's edge nearest the shell outward and are checked for overlap; whatever does not fit is reported by name and not cut (as before). The number of groups is limited to 6.
- **Migration.** Old `keystones {count, side}` becomes one keystone group (`perRow` 1 for left and right, `count` for below) and old `cable {count, diameter}` becomes one hole group per side; corrupt stored data falls back to defaults as elsewhere.
- **Window.** `window.enabled` defaults to true and stays an explicit switch; the closed plate is the off state. A test pins the default.
- **UI.** The Front plate section becomes three headed blocks, "Window", "Keystones and holes" (the group list with add, remove, kind, count, per row, zone, diameter for holes) and nothing named after cables; headings use the same small caption style as other multi-block sections. Strings in en and ru.

## Risks / Trade-offs

- [A collar at the measured size may be too tight or loose for other brands] → the sizes are constants in one place with a clearance setting (default 0.2 mm) and the references are listed; real jacks vary, so the README says to test-print one socket first.
- [Collars behind the plate collide with the shell for narrow free zones] → fit is checked with the collar outline and reported.
- [The group list is more UI than before] → groups are small rows, the default is one keystone-free layout (window only), and the migration keeps old settings working.

## Open Questions

- Whether the default should include one keystone group; the default stays "no groups" so the plate is the window alone.
