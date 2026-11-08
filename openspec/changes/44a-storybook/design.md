# Design: Component Catalog (Storybook)

## Context
PrintKit is a client-only React 19 + TypeScript app with Tailwind CSS v4, Tabler Icons, and i18next. Its UI design is documented across static HTML artboards in `design/artboards/`. As the editor workspace expands with complex panels, floating toolbars, and contextual dialogs, testing components in isolation becomes necessary to prevent regressions and accelerate UI iteration.

## Goals
- Add Storybook 8 with `@storybook/react-vite` sharing the root `vite.config.ts` plugins and CSS.
- Provide global decorators for i18n (`en`/`ru`) and `UnitProvider` (`mm`/`in`).
- Include stories for all `src/ui/` primitives and core editor shell components with mock data.
- Ensure automated verification via portable stories in Vitest so stories never rot.

## Non-Goals
- Visual snapshot regression services (Chromatic, Percy).
- Three.js WebGL viewport story (Viewport is heavy and requires WebGL context; container mocks are used instead).

## Decisions

### Decision 1: Storybook 8 with `@storybook/react-vite`
We use `@storybook/react-vite` configured in `.storybook/main.ts`. It resolves root path aliases and loads `src/app/theme.css` inside `.storybook/preview.ts`. `__APP_VERSION__` is defined to match `vite.config.ts`.

### Decision 2: Global Decorators for i18n and Units
In `.storybook/preview.ts`, we declare global toolbar items:
1. `locale`: choices `en` and `ru`. A decorator calls `i18n.changeLanguage(locale)` before rendering.
2. `unit`: choices `mm` and `in`. A decorator wraps stories in `<UnitProvider initialUnit={unit}>`.
Stories use the standard dark background `#0e1013` (PrintKit background token).

### Decision 3: Portable Stories Smoke Testing with Vitest
Rather than relying solely on manual browser inspection, we add `src/stories.test.ts` which uses `@storybook/react` portable stories (`composeStories`) to mount every exported story in a jsdom test. Any syntax break, missing translation key crash, or undefined prop will fail `npm test`.

## Risks & Mitigations
- **Tailwind v4 in Storybook:** Tailwind v4 uses `@theme` directives directly in CSS. We import `src/app/theme.css` in `.storybook/preview.ts` so all custom color tokens (`--color-surface-1`, `--color-accent`, etc.) are available.
