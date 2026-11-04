# Proposal: 38c Header Breadcrumbs and UI Polish

## Why

The current header uses stacked navigation buttons (product switcher and mode switcher) that clutter the top bar, especially on viewports under 1200 px, and duplicate product and mode information redundantly with the legacy "Master" suffix. In the parameters sidebar, the "Start over" button uses full text taking significant horizontal width, and the export/download block takes up two full vertical rows plus generous padding, consuming precious vertical screen space that could be used for parametric controls. A comprehensive UI/UX audit against the `better-*` design guidelines identified opportunities to streamline color tokens, layout hierarchy, typography wrapping, and interactive micro-interactions.

## What Changes

- **Header Breadcrumbs**: Replace the product switcher buttons and mode switcher buttons with clean breadcrumb navigation (`PrintKit / <Product> / <Mode>`), e.g., `PrintKit / Gridfinity / Box`.
  - Always English for breadcrumbs across all locales.
  - "PrintKit" is shown on all pages as the root crumb linking to `/`.
  - On product start pages (e.g. `/gridfinity`), renders `PrintKit / Gridfinity`.
  - On mode workspaces (e.g. `/gridfinity/box`), renders `PrintKit / Gridfinity / Box`.
  - Products link to their mode chooser (e.g., clicking `Gridfinity` opens `/gridfinity`).
- **Remove "Master" suffix**: Strip "Master" from product branding across the site ("Gridfinity", "Keychain", "Rack" instead of "Gridfinity Master", "Keychain Master", "Rack Master").
- **Beta Label as Tabler Icon**: Move the Beta label before "PrintKit" and render it as an accessible Tabler icon button (`IconFlask` or `IconBeta`) without textual "beta" label, keeping the disclaimer popover and version info on click.
- **Compact Download Block**: Streamline `ExportPanel` and the workspace footer into a compact layout, consolidating controls and reducing vertical padding, giving more space to parameter sections.
- **Icon-only "Start Over" Button**: Change the "Начать заново" / "Start over" button in the sidebar header to an icon-only button (`IconRestore`) with tooltip (`title`) and `aria-label`, matching the adjacent collapse button.
- **Better-* Audit Polish**:
  - **Colors**: Eliminate hardcoded hex values in `Logo.tsx` and `StartLayout.tsx`, replacing them with theme surface and border tokens; verify contrast on subtle text.
  - **Layout**: Ensure responsive breadcrumbs with `truncate` / `min-w-0` that never overflow at 320 px–390 px mobile viewports; harmonize footer padding with `start-over-strip`.
  - **Typography**: Apply `text-balance` to headings and `text-pretty` to card descriptions and dialog bodies; maintain `font-mono` / tabular numbers on all coordinates and dimensions.
  - **UI Micro-interactions**: Add tactile active press scaling (`active:scale-[0.97] transition-transform duration-150`) to buttons, verify nested border radii, and add `overscroll-contain` to modals and dialogs.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `app-shell`: Breadcrumb navigation replacing header button groups, removing "Master" from product names, placing the beta badge as an icon before PrintKit, and making the "Start over" button an icon-only control with tooltip.
- `model-export`: Streamlined compact export panel in workspace footer.

## Impact

- **Affected code**:
  - `src/app/Header.tsx` and `src/app/Header.test.tsx`
  - `src/app/BetaBadge.tsx` and `src/app/BetaBadge.test.tsx`
  - `src/app/Workspace.tsx` and `src/app/startOver.test.tsx`
  - `src/app/StartPage.tsx`, `src/app/StartPage.test.tsx`, `src/app/StartLayout.tsx`
  - `src/features/export/ExportPanel.tsx` and `src/features/export/ExportPanel.test.tsx`
  - `src/app/Logo.tsx`
  - `src/ui/Button.tsx`, `src/ui/ConfirmDialog.tsx`
  - `src/i18n/en.json`, `src/i18n/ru.json`
  - `package.json` and `CHANGELOG.md`
- **Dependencies**: No new npm dependencies; uses existing `@tabler/icons-react` and Tailwind CSS tokens.
- **Out of scope**: Changes to 3D geometry kernels, WASM workers, or WebMCP agents.
- **Target version**: `v1.9.3` (semantic-versioning level: patch).
- **Depends on**: `38b-workspace-layout-polish`.
