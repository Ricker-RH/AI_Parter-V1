# AIFANS Social Surface Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the post, collection, detail, public-profile, and signed-in profile surfaces behave like the approved Threads-inspired responsive design while preserving real data, authentication, and API safety.

**Architecture:** Extract media and viewport-surface responsibilities into focused components/styles instead of extending unrelated global selectors. Keep `PostCard` as the single post renderer for Home/Liked/Saved, use explicit event boundaries for whole-card navigation, and evolve the signed-in profile from the existing real `/api/me`, creator-IP, and social datasets with the smallest owner-scoped following projection only if the current API cannot provide it.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS modules, Vitest/Testing Library, Zod contracts, Hono API, Neon PostgreSQL repositories.

---

### Task 1: Intrinsic-ratio post media and safe whole-card navigation

**Files:**
- Create: `apps/web/src/components/social/PostMedia.tsx`
- Create: `apps/web/src/components/social/PostMedia.module.css`
- Create: `apps/web/src/components/social/PostMedia.test.tsx`
- Modify: `apps/web/src/components/social/PostCard.tsx`
- Modify: `apps/web/src/components/social/PostCard.test.tsx`
- Modify: `apps/web/src/app/globals.css`

- [x] **Step 1: Write failing media tests**

  Cover a single image and a multi-image rail. Assert that each item receives its intrinsic `aspect-ratio`, no full-width filler frame is emitted, the multi-image rail is keyboard-scrollable, and the next item can remain visible.

  ```tsx
  render(<PostMedia authorName="A" items={[portrait]} labels={labels}/>)
  expect(screen.getByRole('img')).toHaveStyle({aspectRatio: '0.8'})
  expect(screen.getByLabelText(labels.postMedia)).toHaveAttribute('data-layout', 'single')
  ```

- [x] **Step 2: Run the focused test and confirm RED**

  Run: `node apps/web/node_modules/vitest/vitest.mjs run --project web apps/web/src/components/social/PostMedia.test.tsx`
  Expected: FAIL because `PostMedia` does not exist.

- [x] **Step 3: Implement the focused media component**

  `PostMedia` owns geometry fallback, the horizontal snap rail, ArrowLeft/ArrowRight scrolling, and media-item rendering. Use a fixed responsive block-size token and `inline-size: auto; max-inline-size: min(...)`; do not add a row-sized neutral background and do not crop or stretch images.

- [x] **Step 4: Write failing card-navigation tests**

  Assert that clicking body/media/non-interactive card whitespace navigates to `/${locale}/posts/${id}`, while avatar/profile/action clicks do not trigger the card navigation. Assert that the DOM contains no nested anchor or button.

- [x] **Step 5: Run the card test and confirm RED**

  Run: `node apps/web/node_modules/vitest/vitest.mjs run --project web apps/web/src/components/social/PostCard.test.tsx`
  Expected: FAIL on card-whitespace navigation.

- [x] **Step 6: Integrate `PostMedia` and safe navigation**

  Give the article a keyboard-accessible detail-navigation handler that ignores events originating from `a, button, input, textarea, select, [role='button']`. Keep author links and `PostActions` as independent controls, and preserve analytics tracking exactly once per detail navigation.

- [x] **Step 7: Remove obsolete global media rules and verify GREEN**

  Delete `.post-media-rail` and `.post-media-frame` rules from `globals.css`; media behavior must live in `PostMedia.module.css`. Run both focused tests and expect PASS.

### Task 2: Shared fixed social surface, action feedback, and collection spacing

**Files:**
- Create: `apps/web/src/components/social/SocialSurface.tsx`
- Create: `apps/web/src/components/social/SocialSurface.module.css`
- Create: `apps/web/src/components/social/SocialSurface.test.tsx`
- Modify: `apps/web/src/components/social/PostActions.tsx`
- Modify: `apps/web/src/components/social/PostActions.test.tsx`
- Modify: `apps/web/src/components/social/FeedContent.tsx`
- Modify: `apps/web/src/components/social/SocialContent.test.tsx`
- Modify: `apps/web/src/components/social/PostDetailContent.tsx`
- Modify: `apps/web/src/app/[locale]/page.tsx`
- Modify: `apps/web/src/app/[locale]/liked/page.tsx`
- Modify: `apps/web/src/app/[locale]/bookmarks/page.tsx`
- Modify: `apps/web/src/app/[locale]/posts/[postId]/page.tsx`
- Modify: `apps/web/src/app/globals.css`

- [x] **Step 1: Write failing surface-contract tests**

  Assert one stationary outer surface contains a contextual header plus one independently scrollable content region. Assert desktop border/radius and clipping are owned by the outer surface, the scrollbar is hidden, and the mobile breakpoint removes the border/radius without disabling scrolling.

- [x] **Step 2: Run the surface test and confirm RED**

  Run: `node apps/web/node_modules/vitest/vitest.mjs run --project web apps/web/src/components/social/SocialSurface.test.tsx`
  Expected: FAIL because `SocialSurface` does not exist.

- [x] **Step 3: Implement and adopt `SocialSurface`**

  Render a fixed header sibling and `minmax(0, 1fr)` scroll region inside one `overflow: hidden` surface. Adopt it in Home, Liked, Saved, and post detail. Preserve the mobile fixed Logo/Tab region and use the same inner scroller, without a mobile outer frame.

- [x] **Step 4: Write failing action-feedback tests**

  Assert liked/bookmarked buttons keep transparent backgrounds, only the SVG becomes filled in the active state, dark mode inherits current foreground, and successful optimistic state remains visible while `router.refresh()` runs.

- [x] **Step 5: Run the action test and confirm RED**

  Run: `node apps/web/node_modules/vitest/vitest.mjs run --project web apps/web/src/components/social/PostActions.test.tsx`
  Expected: FAIL while active-state CSS still applies `var(--shell-hover)`.

- [x] **Step 6: Implement foreground-only action state**

  Remove active background styling. Scope `fill: currentColor` to pressed like/bookmark icons, keep their strokes legible, and leave hover feedback free of a square/rounded gray plate.

- [x] **Step 7: Write failing collection-spacing regression tests**

  Render one and multiple non-empty posts in Home/Liked/Saved. Assert feeds do not use row stretching or `height: 100%` on child cards, while empty/error states may fill remaining space.

- [x] **Step 8: Remove child-frame simulation and verify GREEN**

  Remove selectors that synthesize the desktop frame by rounding/bordering individual feed children. Keep post dividers content-sized and let `SocialSurface` own the frame. Run all Task 2 tests and expect PASS.

### Task 3: Complete the signed-in human profile with real datasets

**Files:**
- Modify: `apps/web/src/components/profile/MyProfilePanel.tsx`
- Modify: `apps/web/src/components/profile/MyProfilePanel.module.css`
- Modify: `apps/web/src/components/profile/MyProfilePanel.test.tsx`
- Create: `apps/web/src/components/profile/MyProfileTabs.tsx`
- Create: `apps/web/src/components/profile/MyProfileTabs.test.tsx`
- Modify: `apps/web/src/app/[locale]/profile/page.tsx`
- Modify: `apps/web/src/lib/social-api.ts`
- Modify only if required: `packages/contracts/src/social.ts`
- Modify only if required: `packages/contracts/src/social.test.ts`
- Modify only if required: `apps/api/src/routes/social.ts`
- Modify only if required: `apps/api/src/routes/social.test.ts`
- Modify only if required: `packages/db/src/social.ts`
- Modify only if required: `packages/db/src/social.test.ts`

- [x] **Step 1: Inventory authoritative datasets before coding**

  Confirm the response shapes and auth behavior for `/api/me`, `/v1/creator/ips`, liked posts, saved posts, and followed IPs. Record whether an owner-scoped followed-IP endpoint already exists; do not add a parallel endpoint if it does.

- [x] **Step 2: Write failing profile-shell and tab tests**

  Assert the ready profile uses the shared responsive header/surface structure, renders one full-width Edit profile button, and exposes roving-keyboard tabs named My IPs, Liked, Saved, and Following with aligned Chinese/English labels.

- [x] **Step 3: Run profile tests and confirm RED**

  Run: `node apps/web/node_modules/vitest/vitest.mjs run --project web apps/web/src/components/profile/MyProfilePanel.test.tsx apps/web/src/components/profile/MyProfileTabs.test.tsx`
  Expected: FAIL because the four-tab profile does not exist.

- [x] **Step 4: Implement the shared profile skeleton**

  Reuse `ProfilePageHeader` and the same fixed/clipped surface contract as the public IP profile. Keep current `/api/me` request cancellation and edit validation. Display the real account bio, use a large responsive avatar, and keep the edit form as an in-place state of the same surface.

- [x] **Step 5: Add real available tab data adapters**

  My IPs reads the existing creator-IP response and Liked/Saved reuse standard `PostCard`/feed rendering. Inventory found no owner-scoped followed-IP listing response, so Following uses the explicit unavailable state instead of mock or placeholder profiles. Each available remote tab has explicit loading, empty, auth, unavailable, and retry states.

- [x] **Step 6 (N/A): Do not add an unsupported followed-IP contract/API/repository path**

  Not performed. Inventory found no existing owner-scoped followed-IP listing endpoint. This slice keeps the Following tab in its explicit unavailable state, so no speculative contract, API route, repository query, schema, role, or policy change was made.

- [x] **Step 7 (N/A): Do not implement a followed-IP projection without an approved endpoint contract**

  Not performed. No query, role, policy, database schema, upload boundary, or operator-capability change was made.

- [x] **Step 8: Verify profile GREEN**

  Run the profile, contract, API, and repository focused tests that were changed. Expect PASS and verify Chinese/English key parity.

### Task 4: Integration, comment-path verification, and preview deployment

**Files:**
- Modify only when a failing integration test proves it necessary: `apps/web/src/components/social/CommentComposer.tsx`
- Modify only when a failing integration test proves it necessary: `apps/web/src/app/api/social/[...path]/route.ts`

- [x] **Step 1: Review all three task diffs for boundary conflicts**

  Resolve shared surface adoption deliberately; do not preserve obsolete global selectors merely to avoid a merge decision. Run `git diff --check`.

- [x] **Step 2: Run full automated verification**

  Run Web Vitest, all workspace typechecks, and the production Web build with the repository's configured Node runtime. Expected: all tests/typechecks/build PASS.

- [ ] **Step 3: Verify comment failure at every boundary**

  Reproduce the signed-in comment request and confirm Web proxy success, API URL, HTTP status, and JSON error code without logging tokens or secrets. The known failing response is `RATE_LIMIT_IDENTITY_UNAVAILABLE`; no comment UI or database change is justified unless this evidence changes.

- [ ] **Step 4: Align the preview signing secret without revealing it**

  Copy the value used by the API environment actually called by the preview into the Web Preview `WEB_API_RATE_LIMIT_SIGNING_SECRET`. Do not print, commit, or persist the value in the repository. Redeploy only the fixed preview branch.

- [ ] **Step 5: Real-browser verification**

  At 430, 768, 1024, and 1440 widths verify fixed header/frame clipping, hidden internal scrollbar, natural-ratio media rail, whole-card navigation exclusions, action states in light/dark mode, all profile tabs, and a successful real comment.

- [ ] **Step 6: Push the tested preview branch**

  Push only `codex/ux-slice-0-1`, record the commit SHA, and verify the stable Vercel branch URL runs that SHA. Do not push `main`.
