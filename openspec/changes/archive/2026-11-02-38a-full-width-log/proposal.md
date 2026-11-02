# Proposal

## Why

The activity log panel currently renders on desktop (`md+`) as a narrow card (`w-[min(760px,100%)]`, `md:left-auto`) anchored to the bottom-right corner above the 36 px measurements bar (`md:right-0 md:bottom-9`). Since the addition of the Resources tab (`37-resource-monitor`) and browser-agent controls (`38-webmcp` — "Allow browser agents" toggle and "Undo agent change" button), the 760 px width forces the panel header to wrap and clips long log lines and resource tables, while leaving the rest of the viewport width unused. Users expect a bottom panel that spans the full width of the viewport area above the status bar without overlapping the status bar or the left parameter sidebar, like Chrome DevTools docked at the bottom of the workspace view.

## What Changes

- **Full-width Chrome DevTools-style bottom panel (`ActivityLogPanel`)**:
  - Make `ActivityLogPanel` on desktop (`md+`) span the entire width of the viewport area (`md:left-[380px] md:right-0`) directly above the status bar (`md:bottom-9`), removing the `760px` max-width constraint (`md:w-[min(760px,100%)]`) and right-only alignment (`md:left-auto`) so it neither overlaps the 380 px side panel nor covers the 36 px status bar.
  - Give the desktop panel a clean, flat top border across the full viewport width (`md:rounded-none md:border-x-0`), matching the Chrome DevTools bottom-docked panel style, while preserving the `65vh` bottom sheet (`rounded-t-group`) on narrow screens (`< 768 px`).

## Capabilities

### New Capabilities

### Modified Capabilities
- `activity-log`: on desktop (`≥ 768 px`), the log panel spans the full width of the viewport area above the status bar without overlapping the side parameter panel or the status bar.

## Impact

- `src/app/ActivityLogPanel.tsx`, `src/app/ActivityLogPanel.test.tsx`.
- Out of scope: docking the log panel to the left/right side, detaching it into a separate window, or changing log entries, filters, resource metrics or WebMCP controls.
- Version 1.9.1 (patch: UI layout rework of the activity log panel without new capabilities).
- Depends on: `29-beta-label`, `31a-status-log`, `37-resource-monitor`, `38-webmcp`.
