# Specification: editor-sweep-loft

## Requirements

### Requirement: Sweep Along Path
The editor shall provide a Sweep operation that extrudes a 2D profile along an arbitrary continuous path.
- The path may consist of sketch lines, arcs, or splines.
- The operation shall offer orientation modes (Frenet and Fixed Up-vector).
- Boolean operations (New body, Join, Cut, Intersect) shall be available.

### Requirement: Multi-Profile Loft
The editor shall support lofting across two or more closed sketch profiles on parallel or arbitrary planes.
- Ruled (straight faceted) and smooth B-spline blend options shall be supported.
- Starting points on profile boundaries shall be automatically aligned to avoid twist.

### Requirement: Draft Faces
The editor shall allow applying a draft/taper angle to faces of a solid.
- The user shall select a neutral plane and pull vector.
- Taper angles between $0.5^\circ$ and $30^\circ$ shall be supported.
