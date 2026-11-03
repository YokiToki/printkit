# Tasks

## 1. Shell & Header Cleanups

- [x] 1.1 Remove models and agent buttons from `Header.tsx`, clean up related handlers, and update `Header.test.tsx` (no artboard exists: built from ui/ and tokens; verify with `npx vitest run src/app/Header.test.tsx`)
- [x] 1.2 Refactor `ConsentBanner.tsx` into a floating popover card in the bottom-left corner with `rounded-2xl` and `shadow-float`, and update `analytics.test.tsx` (no artboard exists: built from ui/ and tokens; verify with `npx vitest run src/app/analytics.test.tsx`)

## 2. Start Page Cards 360px & Tag Containment

- [x] 2.1 Revert `ChoiceCard` width to 360px in `StartLayout.tsx`, constrain tags to prevent horizontal/vertical overflow outside the card, and add a unit test in `StartPage.test.tsx` verifying card dimensions (360px width, 470px height) and tag text containment (no artboard exists: built from ui/ and tokens; verify with `npx vitest run src/app/StartPage.test.tsx`)

## 3. Workspace Sidebar Collapse & Docking

- [x] 3.1 Add collapsible parameter sidebar state and toggle button in `Workspace.tsx`, expanding viewport to full width when collapsed (no artboard exists: built from ui/ and tokens; verify with `npx vitest run src/app/Workspace.test.tsx`)
- [x] 3.2 Move `ActivityLogPanel` from `AppShell.tsx` into `Workspace.tsx` docked above `MeasurementsBar` (`bottom-9`) spanning the viewport and expanding with collapsed sidebar, ensuring it never mounts on start page or mode choosers (no artboard exists: built from ui/ and tokens; verify with `npx vitest run src/app/ActivityLogPanel.test.tsx`)
- [x] 3.3 Style the log button in `StatusBar.tsx` to have outline visible only on hover (no artboard exists: built from ui/ and tokens; verify with `npx vitest run src/features/viewport/StatusBar.test.tsx`)

## 4. Chrome DevTools 4-Tab Activity Log Panel

- [x] 4.1 Restructure `ActivityLogPanel.tsx` with a compact Chrome DevTools-style tab bar and four dedicated tabs (`log`, `agent`, `models`, `resources`), isolating agent enable/undo to the Agents tab and AI model download/management to the Models tab without mixing controls in the header (no artboard exists: built from ui/ and tokens; verify with `npx vitest run src/app/ActivityLogPanel.test.tsx`)
- [x] 4.2 Route `openModelManager()` and `openLog({ source: 'agent' })` to activate their respective tabs in `ActivityLogPanel`, and update `ModelManager.test.tsx` and `agentUi.test.tsx` (no artboard exists: built from ui/ and tokens; verify with `npx vitest run src/features/ml/ModelManager.test.tsx` and `npx vitest run src/agent/agentUi.test.tsx`)

## 5. ResourcesTab CPU Block Fix

- [x] 5.1 Fix text overflow in `ResourcesTab.tsx` by updating `ValueRow` and multi-level pressure times formatting so text wraps properly and never escapes the CPU group box (no artboard exists: built from ui/ and tokens; verify with `npx vitest run src/app/resources/ResourcesTab.test.tsx`)

## 6. Version Bump

- [ ] 6.1 Bump version in `package.json` to 1.9.2 and add entry in `CHANGELOG.md` naming `38b-workspace-layout-polish`

## 7. Verification

- [ ] 7.1 Run `npm test` and `npm run build`, and verify in browser that the activity log renders only in editor workspaces above status bar, sidebar collapses/expands smoothly, the four DevTools tabs are cleanly isolated, CPU text stays inside card bounds, and home page cards render at 360px without tag overflow
