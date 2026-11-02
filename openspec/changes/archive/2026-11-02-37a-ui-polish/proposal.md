# Proposal

## Why

Several small interface details hurt clarity and visual balance across the header, start-page footer and AI model manager:
- The "Support the project" block in the footer looks plain and only offers a USDT TRC20 address, whereas Russian visitors expect a familiar card/SBP tip link (CloudTips) alongside USDT.
- In the top bar, the `mm / in` and `EN / RU` segmented switches are taller (`38 px` total with padding and border) and wider than the neighbouring `32 px` icon buttons (`AI models`, `GitHub`), making the right side of the header look uneven.
- The AI model manager button in the header uses a generic CPU icon (`IconCpu`) instead of an explicit AI icon (`IconAi`).
- Inside the AI model manager dialog, the per-model "Delete" buttons look identical to neutral secondary buttons, and "Delete all" sits in the bottom-right corner of the dialog footer—the exact spot where users instinctively reach for "Close" or "Cancel".

## What Changes

- **Support block in `Footer`**:
  - Add a red filled heart icon (`IconHeartFilled` with `--color-error` and a soft red glow) before the "Support the project" / «Поддержать проект» heading.
  - Add `CLOUDTIPS_URL = 'https://pay.cloudtips.ru/p/67563a44'` in `src/app/site.ts`.
  - Keep the English footer focused on USDT (TRC20); in the Russian locale (`ru`), update the support text to mention both USDT and CloudTips and render a CloudTips link button (`target="_blank"`, `rel="noopener noreferrer"`) next to the USDT address row.
- **Compact header switches (`SegmentedControl` / `Header`)**:
  - Add a `compact` variant to `SegmentedControl` (or compact header styling) so `mm / in` and `EN / RU` in the header have the exact same outer height as the neighbouring header buttons (`h-8` on desktop, `h-9` on narrow screens) with tighter horizontal padding and `text-xs` labels.
- **AI icon on the model manager header button**:
  - Replace `IconCpu` with `IconAi` (`@tabler/icons-react`) in `ModelsButton` (`src/app/Header.tsx`).
- **Danger buttons and "Delete all" placement in `ModelManager`**:
  - Add a `danger` variant to `Button` (`src/ui/Button.tsx`) and `ConfirmDialog` (`src/ui/ConfirmDialog.tsx`) styled with `--color-error-border`, `--color-error-bg` and `--color-error-text`.
  - Style per-model "Delete" buttons and the "Delete all" button (plus its confirmation button) with `danger`.
  - Move the "Delete all" button out of the bottom-right dialog footer into the top-right header of the model list inside the dialog body, so the bottom-right corner can never be mistaken for "Close" or "Cancel".

## Capabilities

### New Capabilities

### Modified Capabilities
- `site-identity`: the footer support heading carries a glowing red heart icon, and in the Russian locale the donation block includes a CloudTips link button alongside USDT (TRC20).
- `cutout-photo-ai`: the model manager header button uses the AI icon, header controls align in height, and the model manager styles delete actions in red and places "Delete all" at the top-right of the model list instead of the dialog footer's bottom-right corner.

## Impact

- `src/app/site.ts`, `src/app/site.test.ts`, `src/app/Footer.tsx`, `src/app/siteIdentity.test.tsx`.
- `src/ui/SegmentedControl.tsx`, `src/ui/Button.tsx`, `src/ui/ConfirmDialog.tsx`, `src/app/Header.tsx`, `src/app/Header.test.tsx`.
- `src/features/ml/ModelManager.tsx`, `src/features/ml/ModelManager.test.tsx`, `src/features/ml/headerModels.test.tsx`.
- `src/i18n/en.json`, `src/i18n/ru.json`.
- Out of scope: new payment providers beyond CloudTips in `ru` and USDT TRC20, changes to AI model download/inference logic, or changes to parameter panel segmented controls.
- Version 1.8.1 (patch: UI polish and Russian donation link without new generator capabilities).
- Depends on: `22a-printkit-branding`, `29-beta-label`, `32-photo-trace-ai`, `37-resource-monitor`.
