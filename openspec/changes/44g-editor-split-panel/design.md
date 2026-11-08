# Design: Non-Modal Split Panel and 3D Viewport Integration

## Context
Splitting a large model across print beds is an interactive spatial problem. Hiding the 3D scene behind a modal dialog prevents users from judging cut locations relative to model features. Shifting Split to a right sidebar panel aligns it with `CutPanel.tsx` and provides continuous 3D feedback.

## Goals
- Remove modal `SplitDialog.tsx` in favor of `SplitPanel.tsx` in the right sidebar.
- Display the target object name and dimensions prominently in the panel header.
- Provide real-time 3D cut preview: translucent cut planes, bed footprint, and part color coding.
- Structure connector configuration per cut face with clear orientation labels.

## Decisions

### Decision 1: Shared Export Printer Profile
Instead of duplicating bed dimensions, `SplitPanel.tsx` reads `useExportSettings()`:
- Usable width: `bed.width - 2 * bed.margin`
- Usable depth: `bed.depth - 2 * bed.margin`
A "Custom" override allows setting arbitrary dimensions for non-standard beds.

### Decision 2: 3D Viewport Split Layer
In `Viewport.tsx`, when `splitConfig` is active:
1. Ground bed rectangle is drawn beneath the object origin in dashed accent color.
2. Translucent planes are rendered at positions along X, Y, and Z.
3. Candidate parts are rendered in distinct colors ($A1, B1, \dots$).
4. An exploded view slider moves candidate parts outward along the normal of their cut planes for inspection.

### Decision 3: Per-Cut Connector Inspector
A list of cuts (e.g. `Cut X1 = 120 mm: Part A1 ↔ Part B1`) lets the user select one cut at a time. The 2D `ConnectorEditor` displays only the selected cut's cross-section with labelled arrows pointing towards each adjoining part.

## Risks & Mitigations
- **Multiple objects selected:** If multiple objects or no object is selected when clicking Split, the panel prompts: "Select a single object to split".
