# Detached Social Page Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every desktop social-page title above its rounded content frame while preserving the current mobile navigation and scrolling behavior.

**Architecture:** `SocialSurface` will render an explicit framed-content sibling after its contextual header, with the nested frame owning desktop border, radius, clipping, and the scroll viewport. The two profile implementations already separate their contextual header from content, so their existing content containers will adopt the same desktop frame contract without changing profile behavior or data flow.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, Vitest, Testing Library, Vercel Preview

---

### Task 1: Detach the shared social header from its content frame

**Files:**
- Modify: `apps/web/src/components/social/SocialSurface.test.tsx`
- Modify: `apps/web/src/components/social/SocialSurface.tsx`
- Modify: `apps/web/src/components/social/SocialSurface.module.css`
- Modify: `apps/web/src/app/globals.test.ts`

- [ ] **Step 1: Write failing structure and CSS ownership tests**

Update the component test to require a dedicated frame between the header and viewport:

```tsx
const surface = screen.getByRole('main')
const header = screen.getByRole('heading', {name: 'For You'}).closest('header')
const frame = surface.querySelector('[data-social-surface-frame]')
const viewport = within(surface).getByRole('region', {name: 'Posts'})
expect(frame).toBeTruthy()
expect(frame).toContainElement(viewport)
expect(frame).not.toContainElement(header)
expect(surface.firstElementChild).toContainElement(header)
expect(surface.children[1]).toBe(frame)
```

Replace the old stylesheet assertions with contracts requiring `.frame` to own `min-height`, `overflow`, desktop background, border and radius; require `.surface` to keep the two-row height layout without a desktop border; require the desktop header divider to be removed while mobile remains frameless.

- [ ] **Step 2: Run RED tests**

Run:

```bash
corepack pnpm --dir apps/web test -- src/components/social/SocialSurface.test.tsx src/app/globals.test.ts
```

Expected: FAIL because `data-social-surface-frame` and `.frame` do not exist and `.surface` still owns the desktop frame.

- [ ] **Step 3: Add the explicit frame wrapper**

Change `SocialSurface` to:

```tsx
return <main className={`${styles.surface}${className ? ` ${className}` : ''}`} data-social-surface>
  <div className={styles.header}>{header}</div>
  <div className={styles.frame} data-social-surface-frame>
    <div aria-label={label} className={styles.viewport} data-social-surface-viewport role="region" tabIndex={0}>{children}</div>
  </div>
</main>
```

Move clipping and desktop frame styles from `.surface` to `.frame`. Keep `.surface` as `display:grid`, `grid-template-rows:auto minmax(0,1fr)`, `height:100%`, `min-height:0`, and `min-width:0`. Give `.frame` `min-height:0`, `min-width:0`, and `overflow:hidden`; give `.viewport` `height:100%`. At `min-width:700px`, put surface background, one-pixel border and 16px radius on `.frame`; remove the bottom divider from contextual `.page-header` elements inside `.header`. At `max-width:699px`, make `.frame` borderless and square.

- [ ] **Step 4: Run GREEN tests**

Run the Task 1 command again. Expected: all selected tests PASS.

- [ ] **Step 5: Commit the shared primitive**

```bash
git add apps/web/src/components/social/SocialSurface.tsx apps/web/src/components/social/SocialSurface.module.css apps/web/src/components/social/SocialSurface.test.tsx apps/web/src/app/globals.test.ts
git commit -m "fix(web): detach social headers from content frames"
```

### Task 2: Apply the same frame boundary to human and IP profiles

**Files:**
- Modify: `apps/web/src/components/profile/MyProfilePanel.test.tsx`
- Modify: `apps/web/src/components/profile/MyProfilePanel.tsx`
- Modify: `apps/web/src/components/profile/MyProfilePanel.module.css`
- Modify: `apps/web/src/components/social/PublicProfileContent.test.tsx`
- Modify: `apps/web/src/components/social/PublicProfileContent.tsx`
- Modify: `apps/web/src/components/social/PublicProfileContent.module.css`

- [ ] **Step 1: Write failing profile frame tests**

Require the existing `ProfilePageHeader` to be outside the content frame and add stable markers to the existing profile content containers:

```tsx
const header = screen.getByRole('heading', {name: /@/}).closest('header')
const frame = container.querySelector('[data-profile-content-frame]')
expect(frame).toBeTruthy()
expect(frame).not.toContainElement(header)
```

Add stylesheet assertions that both profile content containers own desktop `border: 1px solid var(--shell-border)`, `border-radius:16px`, and `overflow:hidden`, while mobile removes border and radius.

- [ ] **Step 2: Run RED profile tests**

```bash
corepack pnpm --dir apps/web test -- src/components/profile/MyProfilePanel.test.tsx src/components/social/PublicProfileContent.test.tsx
```

Expected: FAIL because the profile content-frame markers and desktop frame styles are absent.

- [ ] **Step 3: Mark and style the existing profile frames**

Add `data-profile-content-frame` to `MyProfilePanel`'s existing `styles.surface` element and `PublicProfileContent`'s existing `styles.profileSurface` element. Preserve the contextual header as the preceding sibling. At desktop widths give those content containers the same background, border, radius and clipping as the shared social frame; retain an inner scrolling child or move scrolling to the frame only where necessary to keep one scrollbar. At mobile widths remove those desktop frame decorations and preserve current safe-area/header behavior.

- [ ] **Step 4: Run GREEN profile tests**

Run the Task 2 command again. Expected: all selected tests PASS.

- [ ] **Step 5: Commit profile consistency**

```bash
git add apps/web/src/components/profile/MyProfilePanel.test.tsx apps/web/src/components/profile/MyProfilePanel.tsx apps/web/src/components/profile/MyProfilePanel.module.css apps/web/src/components/social/PublicProfileContent.test.tsx apps/web/src/components/social/PublicProfileContent.tsx apps/web/src/components/social/PublicProfileContent.module.css
git commit -m "fix(web): align profile content frames with social pages"
```

### Task 3: Verify route behavior and responsive geometry

**Files:**
- Modify only if a failing route contract requires it: `apps/web/src/app/[locale]/page.test.tsx`
- Modify only if a failing route contract requires it: `apps/web/src/app/[locale]/liked/page.test.tsx`
- Modify only if a failing route contract requires it: `apps/web/src/app/[locale]/bookmarks/page.test.tsx`
- Modify only if a failing route contract requires it: `apps/web/src/app/[locale]/posts/[postId]/page.test.tsx`

- [ ] **Step 1: Run all affected route and component tests**

```bash
corepack pnpm --dir apps/web test -- 'src/app/[locale]/page.test.tsx' 'src/app/[locale]/liked/page.test.tsx' 'src/app/[locale]/bookmarks/page.test.tsx' 'src/app/[locale]/posts/[postId]/page.test.tsx' 'src/app/[locale]/profile/page.test.tsx' 'src/app/[locale]/profiles/[profileId]/page.test.tsx' src/components/social/SocialSurface.test.tsx src/components/profile/MyProfilePanel.test.tsx src/components/social/PublicProfileContent.test.tsx src/app/globals.test.ts
```

Expected: PASS. If a route assertion encodes the old frame ownership, change only that assertion to require the new header/frame sibling structure, rerun it to observe RED, then rerun after the assertion is aligned with the already specified component contract.

- [ ] **Step 2: Run the complete Web verification gate**

```bash
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web build
git diff --check
```

Expected: all tests and typecheck pass, the production build and prerender verifier complete successfully, and `git diff --check` emits no output.

- [ ] **Step 3: Verify real responsive layouts**

In the deployed or local production build, inspect Home, Liked, Saved, self profile, public profile, and post detail at widths 430, 768, 1024, and 1440. At 700px and above verify the title/actions are outside the rounded frame and the frame has exactly one internal scrollbar. At 430px verify existing top/feed tabs and bottom navigation remain unchanged, the content has no desktop border/radius, and there is no horizontal overflow. Spot-check light and dark modes.

- [ ] **Step 4: Commit any test-only contract alignment**

If Step 1 required route-test changes:

```bash
git add 'apps/web/src/app/[locale]/page.test.tsx' 'apps/web/src/app/[locale]/liked/page.test.tsx' 'apps/web/src/app/[locale]/bookmarks/page.test.tsx' 'apps/web/src/app/[locale]/posts/[postId]/page.test.tsx' 'apps/web/src/app/[locale]/profile/page.test.tsx' 'apps/web/src/app/[locale]/profiles/[profileId]/page.test.tsx'
git commit -m "test(web): cover detached social page headers"
```

If no files changed, record that no additional commit was needed.

### Task 4: Review, push, deploy, and accept the Preview

**Files:**
- No product files unless review finds a concrete regression

- [ ] **Step 1: Review the complete feature diff**

Review from `cfecfce` through HEAD for desktop/mobile geometry, focus behavior, duplicate borders, nested scrollbars, route scope, and unrelated changes. Resolve only evidenced findings and rerun their focused tests.

- [ ] **Step 2: Push only the feature branch**

```bash
git push origin codex/ux-slice-0-1
```

Do not modify or push `main`.

- [ ] **Step 3: Wait for Web Preview success**

Confirm the `Vercel – ai-parter-v1-web` status is success for the final HEAD SHA. API deployment is not required for this CSS/markup-only change.

- [ ] **Step 4: Repeat browser acceptance against the final Preview**

Verify the same six social routes and four widths from Task 3 against the actual Vercel Web Preview. Confirm the browser console has no application error, capture the final URL and SHA, and leave the Home Preview open for user validation.
