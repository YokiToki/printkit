# Tasks

## 1. Setup and Tooling

- [ ] 1.1 Install Storybook dependencies (`@storybook/react-vite`, `@storybook/react`, etc.) and configure `.storybook/main.ts` with Vite config resolution and `__APP_VERSION__` definition. Verification: `npx storybook --version`.
- [ ] 1.2 Configure `.storybook/preview.ts` with global CSS (`src/app/theme.css`), i18n decorator with EN/RU toolbar switcher, and `UnitProvider` decorator with mm/in switcher. Verification: Storybook preview loads dark theme tokens.
- [ ] 1.3 Add scripts `storybook` and `build-storybook` to `package.json`, and add `storybook-static/` to `.gitignore`. Verification: `npm run build-storybook` succeeds.

## 2. Foundation UI Stories (`src/ui/`)

- [ ] 2.1 Add stories for basic input controls: `Button.stories.tsx`, `Toggle.stories.tsx`, `SegmentedControl.stories.tsx`. Built from `design/artboards/Components.dc.html`. Verification: Stories render in Storybook with all variants.
- [ ] 2.2 Add stories for numeric and measurement controls: `NumberField.stories.tsx`, `LengthField.stories.tsx` (stepper ±, min/max limits, mm and inches). Verification: Interactivity check in Storybook.
- [ ] 2.3 Add stories for layout and container controls: `Section.stories.tsx` (default, modified highlight, reset), `Banner.stories.tsx`, `ConfirmDialog.stories.tsx`. Verification: Visual check in Storybook.

## 3. Editor Shell Component Stories

- [ ] 3.1 Add stories for editor navigation: `Toolbar.stories.tsx`, `SketchToolbar.stories.tsx`, `ViewCube.stories.tsx` with mocked callbacks and DoF states. No artboard exists; built from `ui/` components. Verification: Visual check in Storybook.
- [ ] 3.2 Add stories for editor sidebars: `Outliner.stories.tsx` (object hierarchy, lock/visible, health icons) and `Properties.stories.tsx` (transforms, primitive params, mesh health). Verification: Visual check in Storybook.
- [ ] 3.3 Add stories for contextual panels: `ConstraintPanel.stories.tsx`, `FeatureDialog.stories.tsx`, `CutPanel.stories.tsx`. Verification: Visual check in Storybook.

## 4. Automated Testing and Conventions

- [ ] 4.1 Create `src/stories.test.ts` using portable stories (`composeStories`) to mount every story in Vitest (jsdom) and assert no console errors or exceptions. Verification: `npm test` passes.
- [ ] 4.2 Document Storybook convention in `AGENTS.md` (all new `src/ui/` components must ship with co-located `*.stories.tsx`). Verification: file check.

## 5. Version

- [ ] 5.1 Bump `package.json` to 1.15.1 and add `1.15.1 — 44a-storybook` to `CHANGELOG.md`. Test: `npx vitest run src/site.test.ts`.

## 6. Verification

- [ ] 6.1 Run `npm test` and `npm run build` to confirm clean test and TypeScript build.
- [ ] 6.2 Run `npm run build-storybook` to confirm clean static build generation.
