# Tasks

## 1. Label and disclaimer

- [x] 1.1 Beta badge with the disclaimer popover in the header, the disclaimer line in the footer, en and ru strings under `site.beta`. Component tests: the badge is on every route, selecting it shows the text, Escape and an outside click close it, the footer has the same text, key parity, the badge keeps an accessible name.

## 2. Version

- [x] 2.1 Version 1.0.0: `package.json` set to 1.0.0, `vite.config.ts` (and the Vitest configuration) define `__APP_VERSION__` from it, `APP_VERSION` in `app/site.ts` with the type declaration, `v{version}` in the footer and the popover, `CHANGELOG.md` with the 1.0.0 entry and a 0.x summary. Tests: `APP_VERSION` equals `package.json` and matches `MAJOR.MINOR.PATCH`, the footer and the popover show it, the top changelog heading carries it.
- [x] 2.2 The versioning rule in `openspec/config.yaml` (proposal, tasks, archive guidance) and in `CLAUDE.md` (Workflow step, `APP_VERSION` note). Verified by reading the files; the rule's own text is the deliverable.

## 3. Verification

- [x] 3.1 `npm test` and `npm run build` are green, no console errors.
- [x] 3.2 In the browser, en and ru, at 390 and 768 px and desktop: the badge fits next to the logo on the start page, a product page and a mode page, the popover is readable, the footer shows the disclaimer and the version `v1.0.0`.
