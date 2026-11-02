# Tasks

## 1. Support Block: Glowing Red Heart and Russian CloudTips Link

- [x] 1.1 Add `CLOUDTIPS_URL = 'https://pay.cloudtips.ru/p/67563a44'` to `src/app/site.ts`, add `site.footer.cloudtips` to `src/i18n/en.json` and `src/i18n/ru.json`, and update `site.footer.donate` in `src/i18n/ru.json` to mention both USDT (TRC20) and CloudTips; verify in `src/app/site.test.ts` that `CLOUDTIPS_URL` is a valid `https://pay.cloudtips.ru/` URL and i18n keys match.
- [x] 1.2 In `src/app/Footer.tsx` (no artboard exists; built from `Components.dc.html` and theme tokens), add a glowing red `IconHeartFilled` (`text-error drop-shadow-[0_0_6px_var(--color-error)]`, `aria-hidden="true"`) next to the support heading and render a CloudTips link button (`href={CLOUDTIPS_URL}`, `target="_blank"`, `rel="noopener noreferrer"`) only when the active language is Russian (`ru`); update `src/app/siteIdentity.test.tsx` to assert the heart icon, the CloudTips button in `ru`, and its absence in `en`, and verify in the browser in `en` and `ru`.

## 2. Header Switches and AI Models Button Icon

- [x] 2.1 Add `compact?: boolean` to `src/ui/SegmentedControl.tsx` (`h-9 md:h-8 p-0.5` container and `h-full min-w-6 px-2 text-xs font-medium` segment buttons when `compact` is true) and update `src/app/Header.tsx` (compared with `Start.dc.html` and `Components.dc.html`) to pass `compact` to the unit and language switches, align `ModelsButton` and the GitHub link to `h-9 w-9 md:h-8 md:w-8`, and replace `IconCpu` with `IconAi`; update `src/app/Header.test.tsx` and `src/features/ml/headerModels.test.tsx` and verify in the browser in `en` and `ru` (including at `390 px` width).

## 3. Model Manager: Red Delete Buttons and "Delete All" Placement

- [x] 3.1 Add `danger?: boolean` to `src/ui/Button.tsx` and `src/ui/ConfirmDialog.tsx` (`border-error-border bg-error-bg text-error-text hover:bg-error/20`), and update `src/features/ml/ModelManager.tsx` (no artboard exists; built from `Components.dc.html` and `--color-error-*` tokens) so per-model `Delete` and `Delete all` (plus its `ConfirmDialog`) use `danger`, and move `Delete all` from the bottom-right dialog footer into the top-right header row of the model list inside the dialog body; update `src/features/ml/ModelManager.test.tsx` to verify red styling and that `Delete all` sits inside the dialog body header rather than `<footer>`, and check in the browser in `en` and `ru`.

## 4. Version

- [x] 4.1 Bump `version` in `package.json` to `1.8.1` and add the `1.8.1 — 37a-ui-polish` entry at the top of `CHANGELOG.md`; verify `npx vitest run src/app/site.test.ts` passes.

## 5. Verification

- [x] 5.1 Run `npm test` and `npm run build`, start the dev server, and verify in the browser (`en` and `ru`, desktop and `390 px`) the glowing red heart and `ru`-only CloudTips button in the footer, the compact equal-height header switches and `IconAi` button, and the red delete buttons and top-right `Delete all` button in the AI model manager, with zero console errors.
