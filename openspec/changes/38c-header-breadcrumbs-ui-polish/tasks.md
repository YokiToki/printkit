# Tasks

## 1. Product Names and Branding Cleanup

- [x] 1.1 Remove "Master" suffix from `products.*.name` in `src/i18n/en.json` and `src/i18n/ru.json` ("Gridfinity", "Keychain", "Rack") and update corresponding tests in `Header.test.tsx`, `StartPage.test.tsx`, and `i18n.test.ts`. Verify with `npx vitest run src/app/Header.test.tsx src/app/StartPage.test.tsx src/i18n/i18n.test.ts`.
- [x] 1.2 Update references to "Master" in `StartPage.tsx` and comments so product names are clean and consistent. Verify `npm test` passes for start page tests.

## 2. Beta Badge Icon and Placement

- [x] 2.1 Refactor `src/app/BetaBadge.tsx` to render as a pure Tabler icon button (`IconFlask`) without the text "beta" label, keeping `aria-label` and `title` for accessibility and the disclaimer popover on click. Verify with `npx vitest run src/app/BetaBadge.test.tsx`.
- [x] 2.2 In `src/app/Header.tsx`, position the `BetaBadge` immediately before "PrintKit" / Logo. Verify visually and with unit tests.

## 3. Header Breadcrumbs Navigation

- [x] 3.1 Replace `ProductSwitcher`, desktop mode navigation, and `MobileModeSelect` in `src/app/Header.tsx` with English breadcrumbs `PrintKit / <Product> / <Mode>`. Ensure "PrintKit" links to `/` on all pages, the product crumb links to that product's mode chooser, and crumbs are always in English. Verify with `npx vitest run src/app/Header.test.tsx`.
- [x] 3.2 Add responsive styles (`truncate`, `min-w-0`) to breadcrumbs so they fit smoothly without overflowing on mobile viewports down to 320 px. Verify in browser at 390 px and 320 px widths.

## 4. Compact Export Panel and Sidebar Reset Button

- [ ] 4.1 Update the "Start over" / "Начать заново" button in `Workspace.tsx` to an icon-only button with tooltip (`title`) and `aria-label`, matching the adjacent collapse button. Verify with `npx vitest run src/app/startOver.test.tsx`.
- [ ] 4.2 Streamline `ExportPanel.tsx` and reduce `Workspace.tsx` footer padding to `px-3 py-2.5` for a compact footprint while preserving format toggle, printer selector, primary download button, and status indicator. Verify with `npx vitest run src/features/export/ExportPanel.test.tsx`.

## 5. Better-* Visual & Ergonomic Polish

- [ ] 5.1 In `src/app/Logo.tsx`, replace stroke `#161A1F` with `var(--color-surface-1)` and in `src/app/StartLayout.tsx` replace hardcoded hex background gradients with semantic theme tokens (`better-colors`). Verify with `npx vitest run src/app/Logo.test.tsx`.
- [ ] 5.2 In `src/app/StartLayout.tsx` and dialogs, add `text-balance` to headings and `text-pretty` to descriptions (`better-typography`).
- [ ] 5.3 In `src/ui/Button.tsx`, add tactile press scaling `active:scale-[0.97] transition-transform duration-150` and add `overscroll-contain` to `src/ui/ConfirmDialog.tsx` (`better-ui`). Verify with `npx vitest run src/ui/controls.test.tsx`.

## 6. Version Bump

- [ ] 6.1 Bump version to `1.9.3` in `package.json` and add a line to `CHANGELOG.md` naming `38c-header-breadcrumbs-ui-polish`. Verify `npx vitest run src/app/site.test.ts`.

## 7. Verification

- [ ] 7.1 Run `npm test` and verify all unit and integration test suites pass.
- [ ] 7.2 Run `npm run build` and verify `tsc --noEmit` and `vite build` complete with zero errors.
- [ ] 7.3 Browser check: verify breadcrumbs, icon beta badge, compact export block, and reset button across root, Gridfinity, Keychain, and Rack pages in both English and Russian, at desktop and 390 px mobile widths.
