# Proposal

## Why

Parts such as the keystone mounts, the rack enclosures and the photo cutouts are new and not tuned on many real prints and devices. A visitor should not assume that every dimension is right. The site needs to say plainly that it is in beta and that something may be wrong. The same release becomes version 1.0.0, and from now on every change raises the version, so the visitor and the author can tell which build is running.

## What Changes

- **Beta label.** A small "beta" badge next to the site name in the top bar and on the start page, in both languages, in the same style as the existing tags.
- **Disclaimer.** A short text, reachable from the badge and shown in the page footer: the generators are in beta, dimensions and fit may be wrong, check the model and test-print a small part before relying on it, and the author gives no warranty.
- **Version 1.0.0 shown on the site.** This release is 1.0.0 (semantic versioning). The version is read from `package.json` at build time and shown in the footer and in the beta popover, as `v1.0.0`.
- **Versioning rule.** Every change raises the version as its last implementation task: minor for a new feature, mode, pattern or option; patch for fixes and reworks without a new capability; major for an incompatible change (stored settings that cannot be migrated, removed or moved routes). The rule is written into the OpenSpec config (`rules` for tasks and `operations` guidance) and the workflow in `CLAUDE.md`, and each version gets a line in `CHANGELOG.md`.
- **Scope.** It applies to the whole site (it is one label for the project, not a per-feature mark). Per-feature marks can follow later if the user wants them.

## Capabilities

### New Capabilities

### Modified Capabilities
- `app-shell`: a beta label and disclaimer on the site.

## Impact

- `app/Header.tsx` (badge, an explanation popover), `app/Footer.tsx` (the disclaimer paragraph and the version), `app/site.ts` (`APP_VERSION`), `vite.config.ts` (the version define), `package.json` (1.0.0), `CHANGELOG.md`, `openspec/config.yaml` and `CLAUDE.md` (the versioning rule), strings in en and ru, tests.
- Out of scope: per-feature badges, a first-visit modal or consent step, analytics events for the label, git tags and automated releases, a version check that blocks merging.
- Depends on: `22a-printkit-branding`.
