# AIFANS Instant Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace blocking, full-route social navigations with a tested Next.js 16 App Shell, layered cache, streaming, prefetch, and optimistic refresh model.

**Architecture:** Migrate one route class at a time. Cached public data and the shared shell render immediately; session/private/live data stays behind narrow Suspense boundaries. Mutations update local UI first and invalidate precise cache tags instead of broadly calling `router.refresh()`.

**Tech Stack:** Next.js 16.3.3 App Router, React Server Components, Cache Components, Partial Prefetching, Suspense, Vitest, Playwright-compatible navigation tests, Vercel, Neon PostgreSQL, PostHog.

---

### Task 1: Lock the current performance baseline

**Files:**
- Modify: `apps/web/src/components/NavigationFeedback.tsx`
- Modify: `apps/web/src/components/NavigationFeedback.test.tsx`
- Modify: `apps/web/src/components/PerformanceReporter.tsx`
- Modify: `apps/web/src/lib/analytics/performance.ts`
- Test: `apps/web/src/lib/analytics/analytics.test.tsx`

- [ ] Write a failing test that records navigation acknowledgement, destination shell/fallback, and ready timing for every pathname/search transition instead of retaining only the initial route.
- [ ] Run the focused tests and confirm they fail because route-transition metrics are incomplete.
- [ ] Add a route generation identifier and record `interaction`, `shell`, and `navigation` with budgets of 100 ms, 150 ms, and 800 ms.
- [ ] Verify the focused tests pass without making analytics capable of blocking navigation.
- [ ] Capture stable Preview measurements for Home → Search → Post → Back and store the numeric baseline in the deployment report, not in production code.

### Task 2: Enable Cache Components safely

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/src/app/[locale]/layout.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/components/AppShell.test.tsx`
- Modify: `apps/web/src/components/shell/RouteSkeleton.tsx`
- Modify: `apps/web/src/components/shell/RouteSkeleton.test.tsx`

- [ ] Write a failing configuration/shell test asserting `cacheComponents: true`, manual instant validation, and a shared interactive shell that does not await session or page data.
- [ ] Confirm RED before editing configuration.
- [ ] Enable Cache Components with manual-warning validation; do not enable Partial Prefetching yet.
- [ ] Move every request-time/session read below a local Suspense boundary and ensure the contextual surface header is outside the data fallback.
- [ ] Mark routes not yet migrated as explicitly non-instant so the build remains honest and no private data is accidentally cached.
- [ ] Run shell tests, Web typecheck, and production build; confirm GREEN before continuing.

### Task 3: Migrate anonymous Home and public feed caching

**Files:**
- Create: `apps/web/src/lib/social-cache.ts`
- Create: `apps/web/src/lib/social-cache.test.tsx`
- Modify: `apps/web/src/lib/server-api.ts`
- Modify: `apps/web/src/lib/server-api.test.tsx`
- Modify: `apps/web/src/lib/social-api.ts`
- Modify: `apps/web/src/lib/social-api.test.tsx`
- Modify: `apps/web/src/app/[locale]/page.tsx`
- Modify: `apps/web/src/app/[locale]/page.test.tsx`

- [ ] Write failing tests proving public feed reads use cache lifetime/tag metadata while authenticated following reads remain private/request-scoped.
- [ ] Confirm RED while `fetchAifansApi` still forces every request to `no-store`.
- [ ] Replace the unconditional cache override with an explicit request policy: `public-cache`, `private-cache`, or `live-no-store`; reject callers that omit a policy.
- [ ] Implement cached anonymous `for_you` reads tagged by locale and feed kind with stale-while-revalidate behavior.
- [ ] Render the Home surface/header immediately and stream the feed below its own fallback; resolve optional personalization separately.
- [ ] Verify a public feed cache hit and confirm anonymous Home never waits on optional authentication.

### Task 4: Enable Partial Prefetching and core navigation intent

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/src/components/AppNav.tsx`
- Modify: `apps/web/src/components/AppNav.test.tsx`
- Modify: `apps/web/src/components/MobileNav.tsx`
- Modify: `apps/web/src/components/MobileNav.test.tsx`
- Modify: `apps/web/src/components/social/PostCard.tsx`
- Modify: `apps/web/src/components/social/PostCard.test.tsx`

- [ ] Write failing tests for a prefetched App Shell on visible primary navigation and intent-prefetched post/profile destinations without indiscriminately prefetching every infinite-feed link.
- [ ] Confirm RED.
- [ ] Enable `partialPrefetching` only after Task 3 passes instant validation.
- [ ] Prefetch the one shell per primary route; use URL-specific `prefetch={true}` for bounded high-intent links and hover/touch intent for long feed lists.
- [ ] Preserve card analytics semantics and keyboard navigation.
- [ ] Verify production-build client navigation, because automatic prefetch is not representative in development mode.

### Task 5: Replace broad social refreshes with optimistic mutations

**Files:**
- Modify: `apps/web/src/components/social/PostActions.tsx`
- Modify: `apps/web/src/components/social/PostActions.test.tsx`
- Modify: `apps/web/src/components/social/ProfileFollowButton.tsx`
- Modify: `apps/web/src/components/social/ProfileFollowButton.test.tsx`
- Modify: `apps/web/src/components/social/CommentComposer.tsx`
- Modify: `apps/web/src/components/social/CommentComposer.test.tsx`
- Modify: `apps/web/src/components/social/NotificationReadButton.tsx`
- Modify: `apps/web/src/components/social/NotificationReadButton.test.tsx`
- Modify: `apps/web/src/app/api/social/[...path]/route.ts`
- Modify: `apps/web/src/app/api/social/[...path]/route.test.tsx`

- [ ] Write failing tests asserting success paths never call `router.refresh()` and failures roll back only the affected optimistic state.
- [ ] For comments, require the proxy to return the strict created-comment representation and test immediate insertion into the active comment list.
- [ ] Confirm RED against existing refresh calls.
- [ ] Implement optimistic like/bookmark/follow/read state and exact count changes; preserve pending deduplication and stale-response guards.
- [ ] Append a successful real comment locally and focus/announce it; rollback or show inline error on failure.
- [ ] Trigger precise tag invalidation in the trusted server boundary after successful mutations; do not expose an unauthenticated invalidation endpoint.
- [ ] Verify all mutation tests and ensure explicit user Refresh/Retry remains available.

### Task 6: Migrate public Search, Post detail, and IP profile

**Files:**
- Modify: `apps/web/src/app/[locale]/search/page.tsx`
- Modify: `apps/web/src/app/[locale]/posts/[postId]/page.tsx`
- Modify: `apps/web/src/app/[locale]/profiles/[profileId]/page.tsx`
- Modify: `apps/web/src/lib/social-api.ts`
- Modify: corresponding page and social API tests

- [ ] Write failing route tests for immediate shells and tagged public data.
- [ ] Cache search results briefly by normalized public query/category, posts by UUID, and published profiles by UUID; never cache viewer-specific follow/action state in a public entry.
- [ ] Stream viewer personalization into the already rendered public result.
- [ ] Ensure post/profile/search mutations invalidate only their relevant tags.
- [ ] Run instant-navigation validation for direct and client navigation into each route.

### Task 7: Migrate private collections, profile, messages, and notifications

**Files:**
- Modify: `apps/web/src/lib/auth/access-policy.ts`
- Modify: `apps/web/src/app/[locale]/liked/page.tsx`
- Modify: `apps/web/src/app/[locale]/bookmarks/page.tsx`
- Modify: `apps/web/src/app/[locale]/profile/page.tsx`
- Modify: `apps/web/src/app/[locale]/messages/page.tsx`
- Modify: `apps/web/src/app/[locale]/messages/[conversationId]/page.tsx`
- Modify: `apps/web/src/app/[locale]/notifications/page.tsx`
- Modify: corresponding access/page/component tests

- [ ] Write failing tests that session reads stream behind the stable shell and owner data is never stored in a public cache.
- [ ] Add private browser caching with a stale lifetime of at least 30 seconds where safe; key server-derived owner data only by authoritative profile UUID after server authorization.
- [ ] Keep message streams/live sends uncached; incrementally append messages and use background refresh for summaries/notifications.
- [ ] Preserve recent route scroll and loaded state, while closing transient popovers/dialogs when a route becomes hidden.
- [ ] Add logout tests proving user-scoped preserved state is cleared by a hard navigation or user-key reset.

### Task 8: Admin invalidation and production verification

**Files:**
- Modify: trusted Web admin mutation proxy/actions that publish, edit, or delete posts/IP identities
- Modify: corresponding admin integration tests
- Create: `apps/web/e2e/instant-navigation.spec.ts`

- [ ] Write failing integration tests mapping publish/edit/delete operations to feed, post, profile, and search invalidation tags.
- [ ] Implement invalidation only after the authoritative API mutation succeeds.
- [ ] Add direct-visit and client-navigation E2E coverage for Home, Search, Post, Profile, and Back restoration, with visible feedback under 100 ms and immediate shell assertions.
- [ ] Run full Web tests, all workspace typechecks, production build, and `git diff --check`.
- [ ] Deploy the fixed Preview branch and measure cold/warm cache headers, shell timing, ready timing, mutation feedback, and regional execution at 430/768/1024/1440 widths.
- [ ] Push only `codex/ux-slice-0-1`, record the commit SHA, and verify the stable Preview URL runs that SHA.
