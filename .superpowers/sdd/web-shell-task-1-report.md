# Web shell task 1 evidence

## Delivery

- Added the responsive bilingual AIFANS Web shell under `apps/web`.
- Redirects the root route to `/en`, supports `en` and `zh-CN`, and returns not-found for unsupported locales.
- Uses AIFANS UI components/tokens, real locale and theme controls, and honest empty states only.
- Aligns the shared UI React runtime with Web at `19.2.8` to prevent duplicate React renderers in the shell test.

## TDD evidence

1. Created `AppShell.test.tsx` before production implementation.
2. Ran the prescribed focused command; it failed because `apps/web/package.json` did not exist.
3. Implemented the smallest shell and ran the focused test again: 2 passing tests.

## Verification

- `corepack pnpm install --ignore-scripts` — pass. The plain install reported the workspace's build-approval policy for `@parcel/watcher` and `@swc/core`; no approval-policy file was changed.
- `corepack pnpm --dir apps/web test` — 2 passed.
- `corepack pnpm --dir apps/web typecheck` — pass.
- `corepack pnpm --dir apps/web build` — pass.
- `corepack pnpm test` — 42 passed, 13 skipped.
- `corepack pnpm license:check` — pass.
- Forbidden source scan — no matches.
- `git diff --check` — pass.

## Self-review

- Confirmed no compose, post, or publish action exists.
- Confirmed desktop, tablet, and mobile navigation breakpoints match the requested layout.
- Confirmed all rendered user-facing page and navigation copy is loaded from the paired locale JSON files.

## Follow-up visual inspection

- Added mounted-state handling for theme selection so server markup has no selected theme and the client selects only the configured `theme` value after hydration.
- Replaced logo filtering with direct SVG path fills: the mark follows `currentColor`, while its cutout follows the shell surface in both themes.
- Moved body typography to the platform sans stack and added an owned monochrome app icon.
- Restored mobile access to bookmarks, profile, and settings through an accessible More control and verified its destinations in a focused test.
- Wrapped every app empty state in the shared `empty` layout class and verified the recommendations rail receives it.
- Made home feed tabs locale-aware query-state links (`?feed=following`) rather than inert controls.

## Follow-up verification

- `corepack pnpm --dir apps/web test -- ThemeProvider.test.tsx MobileNav.test.tsx RightRail.test.tsx AppShell.test.tsx` — 5 passed.
- `corepack pnpm --dir apps/web typecheck` — pass.
- `corepack pnpm --dir apps/web build` — pass; generated the owned `/icon.svg` route.
