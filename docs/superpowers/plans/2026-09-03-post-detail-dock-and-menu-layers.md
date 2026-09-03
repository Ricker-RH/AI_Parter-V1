# Post Detail Dock and Menu Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Implement one task at a time with RED/GREEN evidence and review checkpoints.

**Goal:** Keep the primary comment composer fully visible at the bottom of post detail while only post/comments scroll, and guarantee that the header action menu paints opaquely above content.

**Architecture:** Add an explicit `docked` viewport layout to `SocialSurface`. In this mode the shared frame is a two-row grid, `PostDetailContent` provides one named scroll region plus one normal-flow footer dock, and the shared surface establishes bounded header/frame stacking contexts. Existing routes retain the default scrolling mode.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, Vitest, Testing Library, Vercel Preview

---

### Task 1: Define the docked shared-surface contract

**Files:**
- Modify: `apps/web/src/components/social/SocialSurface.test.tsx`
- Modify: `apps/web/src/components/social/SocialSurface.tsx`
- Modify: `apps/web/src/components/social/SocialSurface.module.css`

- [ ] **Step 1: Write RED component and CSS tests**

Add tests requiring `viewportLayout="docked"` to mark the frame/viewport mode, make the viewport a non-scrolling two-row grid, and keep the default mode unchanged. The docked viewport must have no `role="region"`, no `tabIndex`, and no `aria-label`; the default scroll viewport must retain its named region and `tabIndex={0}`. Require `isolation:isolate` on the surface, a positioned base-layer frame, and a positioned higher-layer header. For attached mode, also require the viewport itself to establish the base stacking context below its sibling header inside the same frame. Preserve attached/detached header structure.

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web exec vitest run --project web src/components/social/SocialSurface.test.tsx
```

- [ ] **Step 3: Implement the explicit viewport layout**

Add an optional `viewportLayout?: 'scroll' | 'docked'` prop with `scroll` as the default. Expose stable data attributes/classes for the selected layout. In docked mode, make the viewport `display:grid; grid-template-rows:minmax(0,1fr) auto; overflow:hidden` and omit `role`, `tabIndex`, and `aria-label`; the default viewport retains all three. Add `isolation:isolate` to the surface. Give `.frame` and `.viewport` `position:relative; z-index:0`, and keep `.header` at `position:relative; z-index:1`. This bounds high-z descendants in both detached mode (frame below header) and attached mode (viewport below its header sibling) without raising either above document-level portals.

- [ ] **Step 4: Run GREEN and commit**

Run the focused test, Web typecheck, and `git diff --check`, then commit only these files:

```bash
git commit -m "fix(web): add docked social surface layout"
```

### Task 2: Split post-detail content into one scroll row and one dock row

**Files:**
- Modify: `apps/web/src/components/social/SocialContent.test.tsx`
- Modify: `apps/web/src/components/social/PostDetailContent.tsx`
- Modify: `apps/web/src/app/globals.test.ts`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Write RED structure and CSS tests**

Require a successful detail result to return exactly two siblings that become direct children of the docked `SocialSurface` viewport: a focusable `.post-detail-scroll-region.post-detail-content` with `role="region"`, named with the post/comments label, and a following `.post-detail-composer-dock`. Require the scroll region to contain the post card, comments toolbar/list/replies/empty state/pagination, and require the primary composer/sign-in/loading state to live only in the dock. Require error/unavailable states to return one fill-state element without an empty dock.

Add negative assertions for `ResizeObserver`, composer height state/ref, `CSSProperties`, `--post-detail-composer-reserve`, sticky positioning, measured padding, and mobile `bottom` offsets. Add positive CSS assertions for `min-height:0`, `min-width:0`, and the single scroll region's `overflow-y:auto` plus `overscroll-behavior:contain` and hidden scrollbar behavior. The two-row grid belongs only to the docked shared viewport from Task 1; do not introduce a redundant inner grid wrapper.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web exec vitest run --project web src/components/social/SocialContent.test.tsx src/app/globals.test.ts
```

- [ ] **Step 3: Implement the structural dock**

Remove the composer measurement ref/state/effect and reserve custom property. For the success state, return a Fragment whose first child is `.post-detail-scroll-region.post-detail-content`, containing the post and comments content, and whose second child is `.post-detail-composer-dock`. These must be direct grid children of the docked shared viewport; do not retain or add a wrapping detail grid. Give the actual scroll region its accessible role, label, and `tabIndex={0}`. Keep reply composers inline. Style the region as the only vertical scroll owner and the dock as an opaque normal-flow footer. Preserve all comment mutation/reconciliation behavior.

- [ ] **Step 4: Run GREEN and commit**

Run the focused tests, Web typecheck, and `git diff --check`, then commit only Task 2 files:

```bash
git commit -m "fix(web): dock post detail composer"
```

### Task 3: Wire the detail route and correct mobile viewport height

**Files:**
- Modify: `apps/web/src/app/[locale]/posts/[postId]/page.test.tsx`
- Modify: `apps/web/src/app/[locale]/posts/[postId]/page.tsx`
- Modify: `apps/web/src/app/globals.test.ts`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Write RED route and responsive tests**

Require the detail route to select `viewportLayout="docked"`. Split the phone height contract so `.home-page, .collection-page` continue subtracting the external 56px top bar, while `.post-detail-page` uses `calc(100dvh - 50px - env(safe-area-inset-bottom))` because its global mobile top bar is suppressed. Retain `height:100%` at tablet and desktop widths.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web exec vitest run --project web 'src/app/[locale]/posts/[postId]/page.test.tsx' src/app/globals.test.ts
```

- [ ] **Step 3: Wire the route and responsive rule**

Pass `viewportLayout="docked"` from the post-detail page. Change only the mobile height selector/rules needed by the approved contract; do not change shell breakpoints, navigation heights, or other route behavior.

- [ ] **Step 4: Run GREEN and commit**

Run the focused tests, Web typecheck, and `git diff --check`, then commit:

```bash
git commit -m "fix(web): size mobile post detail viewport"
```

### Task 4: Verify menu containment and interaction behavior

**Files:**
- Modify: `apps/web/src/components/social/PostDetailHeader.test.tsx`
- Modify only if required: `apps/web/src/app/globals.test.ts`
- Modify only if required: `apps/web/src/app/globals.css`

- [ ] **Step 1: Strengthen the layer and opacity tests**

Require the menu list to use the fully opaque shell surface and retain its bounded menu layer. Test or assert the surface-level ordering contract: isolated surface, positioned frame below positioned header, menu above its header background. Retain existing keyboard navigation, Escape/outside-click dismissal, copy/share/refresh behavior, and focus restoration tests.

- [ ] **Step 2: Run the focused header/surface tests**

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web exec vitest run --project web src/components/social/PostDetailHeader.test.tsx src/components/social/SocialSurface.test.tsx src/app/globals.test.ts
```

If tests expose a concrete gap, first preserve the failing assertion, make the smallest layer/opacity fix, rerun GREEN, and commit it separately as `fix(web): contain post detail action menu`. If the Task 1 layer contract already satisfies this task, do not create an empty commit.

### Task 5: Full verification, review, deployment, and browser acceptance

- [ ] **Step 1: Run complete local verification**

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web test
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web typecheck
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web build
git diff --check
```

- [ ] **Step 2: Review the complete feature diff**

Perform specification-compliance review followed by code-quality review. Resolve Critical/Important findings and evidenced Minor regressions, with focused tests for every change.

- [ ] **Step 3: Push only the feature branch and wait for Preview**

Push `codex/ux-slice-0-1` only. Do not modify or push `main`. Confirm the Vercel Web Preview success status matches the final HEAD SHA.

- [ ] **Step 4: Browser acceptance on the final Preview**

At 430, 500, 768, 1024, and 1440 pixels in light and dark themes, verify the composer is fully visible, grows upward, remains above mobile navigation, and only the content region scrolls. Open the action menu over text/media and verify it is opaque with no leakage. Check Escape/outside-click/focus behavior, horizontal overflow, duplicate page scrollbars, and application console errors. Leave the final Preview open for the user.
