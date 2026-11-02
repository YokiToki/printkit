# Design

## Context

See `proposal.md` for motivation and scope. `ActivityLogPanel` (`src/app/ActivityLogPanel.tsx`) is mounted once in `AppShell.tsx` and previously used:
`fixed inset-x-0 bottom-0 z-40 flex h-[65vh] flex-col rounded-t-group border border-border-strong bg-surface-1 shadow-xl md:right-0 md:bottom-9 md:left-auto md:h-[40vh] md:w-[min(760px,100%)] md:rounded-tr-none`

## Goals / Non-Goals

**Goals:**
- Render `ActivityLogPanel` on desktop (`md+`, `≥ 768 px`) across the full width of the viewport area (`md:left-[380px] md:right-0`), directly above the 36 px status bar (`md:bottom-9`), without overlapping either the 380 px side parameter panel or the status bar.
- Keep existing mobile (`< 768 px`) bottom-sheet styling (`h-[65vh] rounded-t-group`) and all existing log, resources and browser-agent functionality untouched.

**Non-Goals:**
- Multi-edge docking (left/right/undocked window) or changing log state/storage.

## Decisions

1. **Full-width viewport bottom panel classes (`src/app/ActivityLogPanel.tsx`)**
   - Replace `md:left-auto md:w-[min(760px,100%)] md:rounded-tr-none` with `md:left-[380px] md:rounded-none md:border-x-0`:
     `fixed inset-x-0 bottom-0 z-40 flex h-[65vh] flex-col rounded-t-group border border-border-strong bg-surface-1 shadow-xl md:right-0 md:bottom-9 md:left-[380px] md:h-[40vh] md:rounded-none md:border-x-0`
   - Why `md:left-[380px] md:right-0 md:bottom-9`: in `Workspace.tsx`, the left parameter panel (`aside`) is `md:w-[380px]` with `md:border-r`, and `MeasurementsBar` (`StatusBar`) at the bottom of the viewport is `h-9` (`36 px`). Anchoring the log panel at `md:left-[380px] md:right-0 md:bottom-9` stretches it across the entire viewport width from the sidebar border to the right window edge and sits flush on top of the status bar without covering either the sidebar (and its sticky `ExportPanel`) or the status bar.
   - Why flat borders (`md:rounded-none md:border-x-0`): spanning the full width between the sidebar's right border and the window's right edge calls for a straight horizontal top edge (`md:rounded-none`) and no duplicate vertical borders (`md:border-x-0`), matching Chrome DevTools docked at the bottom.

## Risks / Trade-offs

- **[Risk] Sidebar width alignment** → `Workspace.tsx` defines the desktop sidebar width as `md:w-[380px]`, which `md:left-[380px]` matches exactly.
