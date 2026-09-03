# Unified Mobile Bottom Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the shared mobile bottom navigation stationary on activity and profile routes by giving every public route one bounded inner scroll viewport.

**Architecture:** `PublicShell` remains the sole viewport-height and bottom-navigation owner. Activity adopts the existing `SocialSurface`; profile removes duplicate viewport arithmetic and keeps its existing `.surface` as the only scroll owner.

**Tech Stack:** Next.js, React, CSS Modules, Vitest, Playwright

---

### Task 1: Lock the route scroll contract with failing tests

**Files:**
- Modify: `apps/web/src/components/social/SocialContent.test.tsx`
- Modify: `apps/web/src/components/profile/MyProfilePanel.test.tsx`

- [ ] Add source assertions requiring the activity route to render `SocialSurface` with attached header content and requiring the profile mobile rule to avoid `100dvh` calculations.
- [ ] Run the two focused Vitest files and confirm failure because the production code does not yet satisfy those contracts.

### Task 2: Unify activity and profile scroll ownership

**Files:**
- Modify: `apps/web/src/app/[locale]/activity/page.tsx`
- Modify: `apps/web/src/components/profile/MyProfilePanel.module.css`

- [ ] Wrap both activity success and unavailable states in `SocialSurface`, placing `ActivityTabs` in the attached header and `FeedContent` in its viewport.
- [ ] Make the profile page a one-row, parent-sized grid; remove mobile and desktop viewport-height calculations; retain `.surface { overflow-y: auto }` as the only scroll owner.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Verify, commit, deploy, and inspect Preview

**Files:**
- Test: `apps/web/src/components/social/SocialContent.test.tsx`
- Test: `apps/web/src/components/profile/MyProfilePanel.test.tsx`
- Test: `tests/e2e/mobile-scroll-clearance.spec.ts`

- [ ] Run relevant Vitest tests, Web type checking, the mobile scroll Playwright test, and the production build.
- [ ] At a phone viewport, compare document scroll, inner scroll position, and mobile-navigation rectangle on home, activity liked/saved, and profile.
- [ ] Commit and push `codex/ux-slice-0-1`, wait for the Vercel Preview to become Ready, and repeat the phone verification on the deployed alias.

