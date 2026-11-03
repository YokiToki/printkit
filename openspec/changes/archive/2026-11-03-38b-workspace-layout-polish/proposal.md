# Proposal

## Why

The activity log panel added in 38a currently renders unconditionally in `AppShell`, causing it to appear inappropriately on the root start page and mode choosers where no 3D editor or parameters exist. Additionally, the log panel header is cluttered and mixes controls across domains (agent toggle, undo button, log filters, clear/copy), its desktop layout used a fixed `md:left-[380px]` offset that misaligns when the sidebar is hidden or on different pages, and the Resources tab suffers from text overflowing out of the CPU card due to long pressure strings. Furthermore, the analytics consent banner occupies a full-width block in the bottom document flow which clashes with status bar docking, and the header bar is cluttered with AI model and agent buttons. Finally, start page product/mode cards were previously bumped to 390px to prevent tag text overflow, which altered their designed 360px layout.

## What Changes

- **Activity log restricted to editors**: Render `ActivityLogPanel` exclusively within editor workspaces (`Workspace`), never on the start page or mode choosers.
- **Chrome DevTools-style compact tabs**: Structure the panel with 4 dedicated, compact tabs that do not mix concerns:
  1. **Журнал (`log`)**: Log level filters, source filters, log entry list, Copy and Clear.
  2. **Агенты (`agent`)**: WebMCP agent toggle, agent activity history, and undo controls.
  3. **Модели (`models`)**: AI model listing, download actions, license information, deletion controls, and storage meter.
  4. **Ресурсы (`resources`)**: Support overview, diagnostics toggle, CPU/GPU/Memory metrics, and job reports.
- **Fix CPU block text overflow**: Fix metric value wrapping and containment in `ResourcesTab` (specifically long multi-level pressure times) so text never escapes the CPU group box.
- **Collapsible parameter sidebar**: Add a toggle button in `Workspace` to collapse/expand the `<aside>` parameter panel on desktop. When collapsed, the 3D viewport expands to full width.
- **Log width follows sidebar**: When the sidebar is collapsed, the activity log panel automatically expands across the entire workspace width.
- **Docked above status bar**: The activity log panel docks directly above the status bar (`bottom-9`) on both mobile and desktop, ensuring the status bar is never obscured.
- **Status bar button polish**: Make the status bar activity log trigger button neat with an outline visible only on hover.
- **Header cleanup**: Remove the separate `AgentButton` and `ModelsButton` from the top `Header` navigation bar.
- **Floating analytics banner**: Convert `ConsentBanner` from a full-width bottom layout strip into a floating card in the bottom-left corner with rounded corners (`rounded-2xl`) and shadow, floating over the interface without affecting document layout or status bar positioning.
- **360px start cards with tag fitting**: Return `ChoiceCard` width to `w-[360px]` and ensure tag pills and text fit cleanly without overflowing the card boundaries, with a dedicated height test.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `activity-log`: Panel is editor-scoped, compact and organized into 4 separate tabs (`log`, `agent`, `models`, `resources`) without mixing controls; CPU metrics in resources tab stay strictly bounded; panel expands with collapsible aside and docks directly above the status bar without overlapping it; status bar trigger has an outline on hover only.
- `app-shell`: Header removes model and agent buttons; Workspace provides aside collapse/expand toggle; start page cards maintain 360px width and fixed height with properly contained tags.
- `site-identity`: Analytics consent banner displays as a floating card in the bottom-left corner with rounded corners, overlaying the UI instead of occupying a full-width block in the document flow.

## Impact

- Affected files: `src/app/AppShell.tsx`, `src/app/Header.tsx`, `src/app/Workspace.tsx`, `src/app/ActivityLogPanel.tsx`, `src/app/resources/ResourcesTab.tsx`, `src/features/viewport/StatusBar.tsx`, `src/app/ConsentBanner.tsx`, `src/app/StartLayout.tsx`, `src/features/ml/ModelManager.tsx`, related test suites.
- Out of scope: Changes to 3D geometry builders, agent WebMCP protocol, or server-side analytics.
- Target version: `1.9.2` (patch: UI layout polish and fixes without breaking changes).
- Depends on: `38a-full-width-log`.
