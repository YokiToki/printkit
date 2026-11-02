# Tasks

## 1. Full-Width Activity Log Panel

- [x] 1.1 Update `src/app/ActivityLogPanel.tsx` (no artboard exists; built from `Components.dc.html` and theme tokens) so the log panel on desktop (`md+`) spans the full width of the viewport area above the status bar without overlapping the side panel (`fixed inset-x-0 bottom-0 z-40 flex h-[65vh] flex-col rounded-t-group border border-border-strong bg-surface-1 shadow-xl md:right-0 md:bottom-9 md:left-[380px] md:h-[40vh] md:rounded-none md:border-x-0`); update `src/app/ActivityLogPanel.test.tsx` to assert `md:left-[380px]`, `md:right-0`, `md:bottom-9`, `md:rounded-none`, `md:border-x-0` and the absence of the `760px` max-width / `md:left-auto` constraints, and verify in the browser in `en` and `ru` (desktop and `390 px`).

## 2. Version

- [x] 2.1 Bump `version` in `package.json` to `1.9.1` and add the `1.9.1 — 38a-full-width-log` entry at the top of `CHANGELOG.md`; verify `npx vitest run src/app/site.test.ts` passes.

## 3. Verification

- [x] 3.1 Run `npm test` and `npm run build`, start the dev server, and verify in the browser (`en` and `ru`, desktop and `390 px`) that the activity log panel spans the full viewport width above the status bar without overlapping the side panel or status bar, zero console errors.
