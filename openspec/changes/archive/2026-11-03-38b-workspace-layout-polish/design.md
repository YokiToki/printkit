# Design

## Context

See `proposal.md` for motivation. Currently, `ActivityLogPanel` is mounted at root level in `AppShell`, causing it to appear on the root start page and product mode chooser pages. Its layout previously relied on fixed `md:left-[380px]` positioning. Its header awkwardly mixed the WebMCP agent toggle, agent undo button, view switcher, and log clear/copy buttons. In the Resources tab, long CPU pressure level strings overflowed outside the CPU card boundaries. In addition, the parameter sidebar in `Workspace` could not be hidden, preventing full-screen viewport usage. The header contained separate AI models and agent trigger buttons, while model management was housed in a full-screen modal portal. The analytics consent banner was rendered in document flow as a full-width bottom strip. Finally, `ChoiceCard` was increased to 390px width to accommodate Russian tag labels without wrapping.

## Goals / Non-Goals

**Goals:**
- Restrict `ActivityLogPanel` strictly to editor workspaces by mounting it inside `Workspace`.
- Organize the panel like Chrome DevTools with a compact top tab strip and 4 distinct tabs:
  1. `log` (Журнал): filters, logs list, copy, clear.
  2. `agent` (Агенты): agent permission toggle, agent activity history, undo button.
  3. `models` (Модели): AI model list, downloads, consent, storage meter, delete all.
  4. `resources` (Ресурсы): support line, diagnostics toggle, CPU/GPU/memory cards, jobs table.
- Fix text overflow in the CPU card in `ResourcesTab` by wrapping and constraining long values (pressure times).
- Ensure each tab shows strictly its own controls with no cross-contamination in headers or toolbars.
- Provide a toggle in `Workspace` to collapse/expand `<aside>` on desktop; when collapsed, the 3D viewport and activity log panel expand to full width.
- Dock `ActivityLogPanel` directly above the MeasurementsBar / StatusBar (`bottom-9`) so the status bar is never covered.
- Style the status bar log button cleanly, showing its border outline only upon hover.
- Remove agent and model manager buttons from `Header`.
- Route `openModelManager()` directly to the `'models'` tab in `ActivityLogPanel`.
- Refactor `ConsentBanner` into a floating popover card positioned at `fixed bottom-4 left-4 z-50` with `rounded-2xl` and floating shadow.
- Revert `ChoiceCard` width to `w-[360px]`, ensure tag labels are properly bounded, and assert card height stability in unit tests.

**Non-Goals:**
- Modifying 3D mesh generation, geometry algorithms, or Web Worker communications.
- Reworking WebMCP agent protocol or tools.
- Altering analytics collection logic or external service endpoints.

## Decisions

### 1. Chrome DevTools Tab Bar and Strict Separation
- *Decision*: Create a compact DevTools-style tab bar at the top of `ActivityLogPanel` with 4 tabs: `log`, `agent`, `models`, `resources`.
- *Header Layout*:
  - Tab strip (`flex items-center gap-1 border-b border-border bg-surface-1 px-2 h-9 text-xs`).
  - Active tab indicated with border/background contrast and font weight.
  - Close button (`IconX`, `h-7 w-7`) on the far right.
- *Strict Tab Isolation*:
  - **`log`**: Contains its own sub-toolbar with Level filter (`all`/`warn`/`error`) and Source filters, entry list, jump to latest, and action buttons (`Copy`, `Clear`).
  - **`agent`**: Contains the toggle "Разрешить агентам управлять параметрами", summary of agent status, history of actions executed by WebMCP agents, and the Undo button with confirmation dialog.
  - **`models`**: Contains the model list (matte, depth), download consent flow, per-model delete, total storage usage, and "Delete all" button.
  - **`resources`**: Contains the diagnostics toggle, system capability support summary, CPU/GPU/Memory cards, and the jobs table.

### 2. Fixing CPU Block Text Overflow in ResourcesTab
- *Decision*: In `ResourcesTab.tsx`, update `ValueRow` and the formatting of `pressureTimes`:
  - In `ValueRow`: replace rigid single-line layout (`shrink-0 text-right`) with `min-w-0 flex-wrap` or allow multi-line values when needed.
  - For `pressureTimes`, format as a readable wrapped list or grid of levels so long translations (e.g. Russian "норма 0.0 с · умеренно 0.0 с · серьёзно 0.0 с · критично 0.0 с") wrap cleanly inside the card without pushing past its boundaries.

### 3. Mounting ActivityLogPanel inside Workspace
- *Decision*: Remove `<ActivityLogPanel />` from `AppShell` and render it inside `Workspace` within the viewport container above `MeasurementsBar`.
- *Rationale*: All editor modes use `Workspace`. This guarantees the panel is only rendered during editing, never on `StartPage` or `ModeChooser`.

### 4. Collapsible parameter aside
- *Decision*: In `Workspace`, add state `asideCollapsed`. On desktop (`md:`), when collapsed, `<aside>` is hidden, allowing the viewport section and the docked log panel to expand to 100% width. A toggle button (`IconLayoutSidebarLeftCollapse` / `IconLayoutSidebarLeftExpand`) in the sidebar header and viewport toggles this state.

### 5. Floating analytics popover
- *Decision*: Give `ConsentBanner` `fixed bottom-4 left-4 z-50 max-w-sm rounded-2xl border border-border-strong bg-surface-1 shadow-float p-4`.
- *Rationale*: Floating over the UI completely detaches it from the page layout stream, eliminating vertical jumping and status bar interference.

### 6. Card width 360px and tag containment
- *Decision*: Set `ChoiceCard` width to `w-[360px]` and constrain tags with `max-w-[130px] truncate` or flex containment so pills do not push the arrow button outside the card or cause line overflow. Add a vitest test checking card height `470px`.

## Risks / Trade-offs

- *[Risk]*: Users switching to the log panel expecting agent undo immediately visible in log tab header.
  - *Mitigation*: The dedicated "Agents" tab houses all agent actions cleanly, and agent log entries in the Journal tab retain inline undo buttons for specific actions.
- *[Risk]*: Long tag translations in future languages might get clipped.
  - *Mitigation*: Use `truncate` on individual tag pills with title tooltips to maintain card visual integrity.
