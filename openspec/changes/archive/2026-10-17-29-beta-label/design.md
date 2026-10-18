# Design

## Context

The header shows the logo with the product name (`Header.tsx`), the footer of the start pages holds the support block and the GitHub link (`Footer.tsx`), and strings live under `site.*`.

## Decisions

- **Badge.** A `<button>` styled as a small tag (tokens from `theme.css`, same family as the card tags) reading "beta" after the site name in the header and in the start page title area. It opens a small popover (the `details` pattern already used by the product switcher) with the disclaimer text; it closes on Escape or an outside click. It is visible at 390 px (icon-sized next to the logo when the name is hidden).
- **Disclaimer text** (en/ru under `site.beta`): "PrintKit is in beta. Dimensions, fit and print settings may be wrong. Check the model and test-print a small part before you rely on it. No warranty." The footer repeats the same sentence without the popover.
- **No state.** The label is always shown; nothing is stored.
- **Accessibility.** The badge has an accessible name ("beta, show details") and the popover is a labelled region; the footer text is plain text.

- **Version source.** `package.json` `version` is the only place the version is written. `vite.config.ts` reads it and defines `__APP_VERSION__` (also in the Vitest configuration so tests see it); `app/site.ts` exports `APP_VERSION` from it, next to the other site constants. The footer and the popover show `v{APP_VERSION}`; there is no second copy of the number in the code. This release sets it to `1.0.0`.
- **Bump rule.** Semantic versioning, applied per change and decided when the change is planned (stated in its proposal): minor for a new feature, mode, pattern or option; patch for a fix or rework without a new capability; major for an incompatible change (a stored setting that cannot be migrated, or a removed or moved route). The change's tasks name the target version and end the implementation with a "bump version" task (`package.json`, `CHANGELOG.md`), before the verification section. A bump never goes backward and changes are applied in numeric order, so the version follows that order. This change is the first to follow the rule and is the release 1.0.0.
- **Where the rule lives.** In `openspec/config.yaml`: a `proposal` rule (state the target version and the bump level), a `tasks` rule (end implementation with the bump task) and `operations.archive.guidance` (check that `package.json` has the target version and `CHANGELOG.md` its line before archiving). In `CLAUDE.md`: the Workflow step and the Architecture note on `APP_VERSION`. The rule text is written when this change is planned, so it already holds for the changes after it.
- **Changelog.** `CHANGELOG.md` has one entry per version, newest first, naming the change: `## 1.0.0 — 29-beta-label: beta label, disclaimer, versioning`. Earlier work is summarised in a single `0.x` entry.
- **Test.** A test pins that `APP_VERSION` equals `package.json`, matches `MAJOR.MINOR.PATCH`, and appears in the footer and the popover; another that the first `CHANGELOG.md` heading carries that version.

## Risks / Trade-offs

- [The rule is only a convention and can be skipped] → the archive guidance and the changelog test (top entry equals `package.json`) catch a forgotten bump or changelog line.
- [A version define breaks in tests] → the define is in both the Vite and the Vitest configuration and the test above fails loudly if it is missing.
- [The header is already tight at 390 px and in ru] → the badge is icon-sized below `md` and the layout is checked in both languages at 390 and 768 px.
