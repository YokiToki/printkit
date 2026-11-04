# Technical Design: 38c Header Breadcrumbs and UI Polish

## Context

The top header currently uses two button groups (`ProductSwitcher` and mode `nav`) plus a mobile `details` menu. This consumes significant horizontal space and duplicates product names with redundant "Master" suffixes. Concurrently, the parameters sidebar footer devotes large vertical padding to export controls, and the "Start over" button displays full text in a dedicated strip.

See `proposal.md` for background and user requirements.

## Goals / Non-Goals

**Goals:**
- Replace product and mode button switchers in `Header.tsx` with an accessible breadcrumb trail (`PrintKit / <Product> / <Mode>`), always in English.
- Place the Beta label before "PrintKit" as a Tabler icon button that triggers the disclaimer popover.
- Remove "Master" branding across product names, cards, and titles.
- Streamline the parameters sidebar footer (`ExportPanel`) and sidebar reset button into compact controls.
- Address findings from `better-colors`, `better-layout`, `better-typography`, and `better-ui`.

**Non-Goals:**
- Changes to 3D geometry generation, WASM kernels, or WebMCP agent capabilities.
- Redesigning the entire start page layout or removing start page product cards.

## Decisions

### 1. Header Breadcrumbs Navigation
- **Structure**: Rendered as `<nav aria-label="Breadcrumb">` containing an ordered list `<ol className="flex items-center gap-1.5 font-medium text-xs sm:text-sm">`.
  - Item 1: `PrintKit` linking to `/` (with `Logo` beside it).
  - Item 2 (when inside product): `/ <Product>` linking to `/<product.id>` (e.g. `/gridfinity`).
  - Item 3 (when inside mode): `/ <Mode>` (e.g. `Box`) marked with `aria-current="page"`.
- **Language**: English breadcrumb labels are hardcoded for consistent URL/hierarchy mapping (`Gridfinity`, `Keychain`, `Rack`, and `Box`, `Baseplate`, `Cutout`, `Image`, `Shape`, `Panel`, `Enclosure`, `Shelf`), meeting the explicit user instruction.
- **Mobile responsiveness**: Breadcrumb items use `truncate max-w-[120px] sm:max-w-none` so they fit gracefully without causing header overflow on 320 px–390 px screens.

### 2. Beta Badge Placement and Icon
- Moved to the left of "PrintKit" in the header.
- Rendered as an icon button with `IconFlask` (size 15, stroke 1.75) inside a subtle circular button (`h-6 w-6 rounded-full border border-border-strong bg-surface-2 text-text-muted hover:text-text hover:bg-surface-3`).
- Tooltip via `title={t('site.beta.label')}` and accessible name via `aria-label={t('site.beta.label')}`.
- Click opens the existing floating popover containing disclaimer copy and `APP_VERSION`.

### 3. "Master" Removal
- Strip "Master" from `products.gridfinity.name`, `products.keychain.name`, `products.rack.name` in both `en.json` and `ru.json`.
- Product names become simply "Gridfinity", "Keychain", "Rack".

### 4. Compact Export Panel
- `Workspace.tsx` footer container reduced from `px-4 py-3` to `px-3 py-2.5`.
- `ExportPanel.tsx`:
  - Consolidate controls into a streamlined toolbar: Download button (primary, `h-8`), format segmented control (`STL` / `3MF`), and printer selector dropdown (`h-8`).
  - Status indicator (building, fits, overflow) displayed compactly with an icon and concise status text.
  - Multi-part split download buttons tightened to `gap-1` and `h-7.5`.

### 5. Icon-only "Start Over" Button
- In `Workspace.tsx`, convert `<button ref={startOverBtn}>` from `gap-1.5 px-3 text-sm` to an icon-only square button `h-8 w-8 items-center justify-center`.
- Set `aria-label={t('startOver.button')}` and `title={t('startOver.button')}`.
- Keeps confirmation dialog workflow intact.

### 6. Better-* Audit Implementations
- **Colors**:
  - In `src/app/Logo.tsx`, replace stroke `#161A1F` with `var(--color-surface-1)`.
  - In `src/app/StartLayout.tsx`, replace raw hex gradient `#1a1f26` / `#14181d` with semantic theme tokens (`var(--color-surface-2)` / `var(--color-surface-1)`).
- **Layout**:
  - Add `min-w-0` and `overflow-hidden` wrappers to breadcrumb trail to guarantee zero horizontal scroll on small devices.
  - Add `overscroll-contain` to `ConfirmDialog.tsx` overlay.
- **Typography**:
  - Add `text-balance` to headings in `StartLayout.tsx` and start page titles.
  - Add `text-pretty` to card descriptions and dialog messages.
- **UI Micro-interactions**:
  - Add `active:scale-[0.97] transition-transform duration-150` to `Button.tsx` for tactile feedback on press.

## Risks / Trade-offs

- **[Risk] Breadcrumbs on narrow screens (<360 px)**: Full breadcrumb trail `PrintKit / Gridfinity / Baseplate` could take ~200 px, competing with unit and language segmented controls.
  - **Mitigation**: Use `truncate` on individual crumb items and `gap-1`, and allow product crumb to abbreviate or truncate if needed on screens < 360 px.
- **[Risk] Test breakage from "Master" removal**: Existing tests looking for `Gridfinity Master` or `Keychain Master`.
  - **Mitigation**: Update test assertions to match the new clean product names and breadcrumbs.
