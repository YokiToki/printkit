# Design

## Context

See `proposal.md` for motivation and scope. All changes are local to existing React components (`Footer.tsx`, `Header.tsx`, `SegmentedControl.tsx`, `Button.tsx`, `ConfirmDialog.tsx`, `ModelManager.tsx`), site constants (`site.ts`) and translation files (`en.json`, `ru.json`).

## Goals / Non-Goals

**Goals:**
- Keep the visual language strictly on existing Tailwind `@theme` tokens (`--color-error`, `--color-error-bg`, `--color-error-border`, `--color-error-text`, `--color-border`, `--color-surface-*`).
- Align header control heights without affecting parameter-panel `SegmentedControl` instances.
- Make destructive actions in `ModelManager` unmistakably destructive and keep the dialog footer free of a right-aligned destructive button.

**Non-Goals:**
- Adding new theme tokens or changing parameter-panel segmented controls.
- Changing any model storage or download behaviour.

## Decisions

1. **Glowing red heart in `Footer.tsx`**
   - Render `IconHeartFilled` (`size={16}`) from `@tabler/icons-react` inside a `flex items-center gap-1.5 font-medium text-text` container around `t('site.footer.support')`.
   - Style the icon with `text-error drop-shadow-[0_0_6px_var(--color-error)]` and `aria-hidden="true"` so screen readers announce the heading cleanly without noise.

2. **CloudTips button in Russian locale (`Footer.tsx`, `site.ts`)**
   - Export `CLOUDTIPS_URL = 'https://pay.cloudtips.ru/p/67563a44'` from `src/app/site.ts` and validate it in `src/app/site.test.ts`.
   - Check `i18n.resolvedLanguage === 'ru'` in `Footer`. When `true`, render a vertical divider (`h-5 w-px bg-border-strong`) and an external link button (`<a href={CLOUDTIPS_URL} target="_blank" rel="noopener noreferrer" data-testid="cloudtips-link">`) styled as a compact control button (`h-8 rounded-control border border-border-strong bg-surface-2 px-3 text-xs font-medium text-text no-underline hover:bg-surface-3`) alongside the USDT address row, and update `ru.json` `site.footer.donate` to mention USDT (TRC20) and CloudTips. In `en`, only the USDT TRC20 address and copy button are shown.

3. **Compact header switches (`SegmentedControl.tsx`, `Header.tsx`)**
   - Add an optional `compact?: boolean` prop to `SegmentedControl`:
     - Default (`!compact`, used in parameter panels): unchanged (`p-0.5`, buttons `min-h-8 min-w-8 px-3`).
     - `compact` (used for unit and language switches in `Header.tsx`): outer container `h-9 md:h-8 items-center p-0.5` (`36 px` on mobile, `32 px` on `md+`), inner buttons `h-full min-w-6 px-2 text-xs font-medium`.
   - Update `ModelsButton` and the GitHub `<a>` in `Header.tsx` from `h-10 w-10 ... md:h-8 md:w-8` to `h-9 w-9 ... md:h-8 md:w-8` so every control on the right side of the header is `36 px` high on narrow screens and `32 px` high on `md+`.
   - Shorten Russian inch label in `ru.json` (`units.in`) or keep `"дюйм"` with `px-2 text-xs` so both segments stay narrow and balanced.

4. **AI icon on `ModelsButton` (`Header.tsx`)**
   - Replace `IconCpu` with `IconAi` (`size={18}` on `32 px` button so the letters "AI" read crisply) from `@tabler/icons-react`.

5. **Danger buttons and "Delete all" placement (`Button.tsx`, `ConfirmDialog.tsx`, `ModelManager.tsx`)**
   - Add `danger?: boolean` to `Button`: when `danger` is true, apply `border-error-border bg-error-bg text-error-text hover:bg-error/20` instead of the neutral or primary palette.
   - Add `danger?: boolean` to `ConfirmDialog` and forward it to the confirm `Button` (`primary={!danger} danger={danger}`).
   - In `ModelManager.tsx`:
     - Pass `danger` to the per-model `<Button danger onClick={() => void store.remove(spec.id)}>{t('ml.delete')}</Button>`.
     - Move `<Button danger onClick={() => setConfirmAll(true)} disabled={used === 0}>{t('ml.deleteAll')}</Button>` from `<footer>` into the header row at the top of the scrollable body (right-aligned opposite `t('ml.intro')`, or in a header bar directly above the model sections).
     - Pass `danger` to the `ConfirmDialog` for `confirmAll`.
     - Leave `<footer>` with the used-space readout on the left and the "Open the log" link on the right.

## Risks / Trade-offs

- **[Risk] Narrow `390 px` header overflow in Russian (`мм / дюйм`)** → `compact` uses `px-2 text-xs` (`min-w-6`), which is narrower than the previous `min-w-8 px-3` (`max-[400px]:px-2`), freeing horizontal space at `390 px`. Verified in browser at `390 px` in both `en` and `ru`.
