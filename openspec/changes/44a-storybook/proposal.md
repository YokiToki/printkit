# Proposal

## Why

PrintKit's UI component library (`src/ui/`) and modular editor controls have grown across 44 changes without an isolated visual catalog. Developers currently verify UI states, dark theme tokens, and bilingual labels (EN/RU) by navigating live modes or checking static HTML artboards. Adding Storybook allows isolated component development, interactive state inspection (disabled, error, stepper, units), and automated rendering verification without running the full WASM/WebGL canvas.

## What Changes

- **Storybook 8 Integration:** Configure Storybook (`@storybook/react-vite`) inside `.storybook/` integrated with Vite 6/7, Tailwind CSS v4 (`src/app/theme.css`), and the build-time define `__APP_VERSION__`.
- **Global Decorators:** Provide an i18next language switcher (EN / RU) in the Storybook toolbar, a `UnitProvider` toggle (mm / inch), and dark workspace backgrounds matching PrintKit's theme tokens.
- **UI Component Stories:** Add co-located `*.stories.tsx` stories for all foundational controls in `src/ui/` (`Button`, `Toggle`, `SegmentedControl`, `NumberField`, `LengthField`, `Section`, `ConfirmDialog`, `Banner`, `ContextMenu`).
- **Editor Shell Stories:** Add stories with mocked data for key Editor panels and widgets (`Toolbar`, `SketchToolbar`, `Outliner`, `Properties`, `ViewCube`, `MeasurementsBar`). WebGL Viewport is mocked with placeholder boundaries.
- **Automated Smoke Testing:** Add a Vitest test (`stories.test.ts`) using Storybook portable stories (`composeStories`) to assert that every story renders without throwing or logging console errors.
- **NPM Scripts:** Add `npm run storybook` for local development and `npm run build-storybook` for static export into git-ignored `storybook-static/`.

## Capabilities

### New Capabilities
- `component-catalog`: Storybook configuration, global theme/i18n/unit decorators, component story definitions, and smoke test suite for the UI library.

### Modified Capabilities

## Impact

- Affects developer tooling and adds devDependencies (`@storybook/react-vite`, `@storybook/react`, etc.).
- Adds `.storybook/main.ts`, `.storybook/preview.ts`, and `*.stories.tsx` files across `src/ui/` and `src/features/editor/`.
- No breaking changes or runtime bundle impact on the production web application.
- Target version: 1.15.1 (patch: developer tooling and component catalog without modifying production geometry or storage schema).
- Out of scope: Visual regression testing services (Chromatic/Percy), deployment of Storybook to public subdomains.
- Depends on: `44-editor-face-tools`.
