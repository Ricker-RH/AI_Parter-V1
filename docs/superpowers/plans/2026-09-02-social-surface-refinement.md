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

  Confirmed the response shapes and auth behavior for `/api/me`, `/v1/creator/ips`, liked posts, saved posts, and followed IPs. No owner-scoped followed-IP listing endpoint existed. The existing actor transaction, published-IP projection, and `social_viewer_follows` owner predicate provide the minimum safe database boundary without a schema, migration, RLS, or role change.

- [x] **Step 2: Write failing profile-shell and tab tests**

  Assert the ready profile uses the shared responsive header/surface structure, renders one full-width Edit profile button, and exposes roving-keyboard tabs named My IPs, Liked, Saved, and Following with aligned Chinese/English labels.

- [x] **Step 3: Run profile tests and confirm RED**

  Run: `node apps/web/node_modules/vitest/vitest.mjs run --project web apps/web/src/components/profile/MyProfilePanel.test.tsx apps/web/src/components/profile/MyProfileTabs.test.tsx`
  Expected: FAIL because the four-tab profile does not exist.

- [x] **Step 4: Implement the shared profile skeleton**

  Reuse `ProfilePageHeader` and the same fixed/clipped surface contract as the public IP profile. Keep current `/api/me` request cancellation and edit validation. Display the real account bio, use a large responsive avatar, and keep the edit form as an in-place state of the same surface.

- [x] **Step 5: Add real tab data adapters and preserve pagination**

  My IPs reads the existing creator-IP response, Liked/Saved reuse standard `PostCard` rendering, and Following reads the authenticated followed-IP projection. All four tabs preserve `nextCursor`, append later pages through an explicit Load more action, retain loaded items on continuation failure, and expose loading, empty, auth, unavailable, and retry states. No tab uses mock production data.

- [x] **Step 6: Add the minimum owner-scoped followed-IP projection**

  Added a strict public followed-IP page DTO and dedicated opaque cursor. The repository runs inside the verified actor transaction, scans the RLS-visible published IP rows, filters each candidate through the existing SECURITY DEFINER `social_viewer_follows(profile_id)` owner predicate, and projects only `social_public_ip_profile(profile_id)` fields. This is intentionally not a follows-driven query: `aifans_authenticated` has neither `SELECT` privilege nor a SELECT RLS policy on `public.follows`, and the existing bounded helper returns only a boolean for one target. A follows-driven implementation therefore requires a separately reviewed SECURITY DEFINER listing function and migration; none was added within this no-schema/no-role-change slice.

- [x] **Step 7: Connect the authenticated API, BFF, and Following tab**

  Added `GET /v1/following` through the existing strict owner-page route helper, authentication flow, the reused `social_mutation` rate-limit policy, cursor validation, and response parsing. The Web BFF allowlists only the cursor query and forwards the request with the existing short-lived bearer token. The profile tab parses the strict response and renders real public IP links.

- [x] **Step 8: Verify profile GREEN**

  Profile, contract, API, BFF, and repository unit tests pass. Feed pages keep `author.followerCount` optional for a rolling-deploy compatibility window, while the current repository enriches new pages with the authoritative count; contract and public-cache replay tests accept both old and new payloads. English/Chinese message key parity is 370/370. The focused Following repository integration passes against the disposable local database. The full database suite still exposes independent pre-existing chat fixture/transaction failures and liked-cursor microsecond truncation; those are outside this profile slice, and no remote database was accessed.

### Task 4: Integration, comment-path verification, and preview deployment

**Files:**
- Modify only when a failing integration test proves it necessary: `apps/web/src/components/social/CommentComposer.tsx`
- Modify only when a failing integration test proves it necessary: `apps/web/src/app/api/social/[...path]/route.ts`

- [x] **Step 1: Review all three task diffs for boundary conflicts**

  Reviewed the combined task diff after the concurrent surface work landed and kept the profile/API/contracts/database edits isolated. `git diff --check` passes.

- [x] **Step 2: Run full automated verification**

  Web Vitest passes 802/802 from its workspace directory, all five workspace typechecks pass, the production build and prerender-shell verifier pass with the repository's documented local-only signing value, and the license check passes. The available Node 24.16.0 emits an engine warning against the repository's `>=24.19.0` declaration.

- [ ] **Step 3: Verify comment failure at every boundary**

  Reproduce the signed-in comment request and confirm Web proxy success, API URL, HTTP status, and JSON error code without logging tokens or secrets. The known failing response is `RATE_LIMIT_IDENTITY_UNAVAILABLE`; no comment UI or database change is justified unless this evidence changes.

- [ ] **Step 4: Align the preview signing secret without revealing it**

  Copy the value used by the API environment actually called by the preview into the Web Preview `WEB_API_RATE_LIMIT_SIGNING_SECRET`. Do not print, commit, or persist the value in the repository. Redeploy only the fixed preview branch.

- [ ] **Step 5: Real-browser verification**

  At 430, 768, 1024, and 1440 widths verify fixed header/frame clipping, hidden internal scrollbar, natural-ratio media rail, whole-card navigation exclusions, action states in light/dark mode, all profile tabs, and a successful real comment.

- [ ] **Step 6: Push the tested preview branch**

  Push only `codex/ux-slice-0-1`, record the commit SHA, and verify the stable Vercel branch URL runs that SHA. Do not push `main`.
