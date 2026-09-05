# Navigation Warmup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Prepare first-page navigation data without blocking the entry route or repeating requests.
**Architecture:** Reuse the existing account provider, QueryClient and route prefetch. Colocated query options become the single data contract for components and a cancellable idle scheduler. Background requests are read-only, serial, account-scoped and never cache failed result envelopes as fresh success.
**Tech Stack:** Next.js 16.3.3, React 19, TanStack Query 5, Vitest, Playwright.

## Task 1: Shared query contracts
Files: create components/social/home-feed-query.ts, components/chat/ai-inbox-query.ts, components/profile/my-profile-query.ts and colocated tests; modify CachedHomeFeed.tsx, CachedMessagesWorkspace.tsx, MyProfileTabs.tsx.
- [ ] Write tests importing homeFeedQueryOptions(scope,locale,kind,cursor?), aiInboxQueryOptions(scope,locale,cursor?), myProfileQueryOptions(scope,locale,tab,cursor?). Use real QueryClient and mocked HTTP responses matching contract schemas.
- [ ] Run tests and observe missing exports/failing required assertions before implementation.
- [ ] Move existing request/parsing logic into colocated modules and build options with the same existing keys, e.g. queryOptions({queryKey:['ai-chat',scope,locale,'inbox',cursor??null],queryFn:({signal})=>loadAiInbox(cursor,signal),staleTime:30000}). Existing page imports and uses the exported options; preserve loadHomeFeed export compatibility.
- [ ] Non-success HTTP/schema/network results must throw for query execution, preserving good cache on revalidation; aborts propagate. UI keeps existing auth/unavailable presentation from explicit errors, not success-cache envelopes. Preserve initialResult compatibility.
- [ ] Test prefetch then fetch uses one HTTP request, simultaneous access reuses in-flight request, failure permits later on-demand retry, abort signal propagates and account/locale keys differ.
- [ ] Run existing scoped tests plus new contracts. Commit only these task files after review.

## Task 2: Lifecycle-aware navigation warmup
Files: create components/navigation/NavigationWarmup.tsx, navigation-warmup.ts and tests; modify locale layout, AppQueryProvider if cancellation is needed. Human inbox read path may be extracted to human-inbox-query.ts and consumed by HumanMessagesWorkspace; preserve realtime/reconnect semantics.
- [ ] Test serial scheduling, entry-route exclusion, initial-render priority, route cleanup, offline/hidden/slow/save-data suppression, unknown network support, foreground in-flight deduplication and failure isolation.
- [ ] Add idle scheduling after window load and route-ready signal, checking active QueryClient fetches before starting each task. requestIdleCallback feature detection with a conservative timer fallback. No mandatory timeout forcing background work during busy periods.
- [ ] Build tasks only for confirmed authenticated accounts: default home feed, AI inbox, human inbox when kind=human, personal default ips tab. Skip current destination. Anonymous visitors may warm only public home data. Auth/administrator routes do not warm personal navigation. Data already fresh/in flight uses QueryClient semantics.
- [ ] Reset queue on route/account/locale change; remove pending callbacks/listeners. Cancel old private queries on identity change before removing cache. Do not cancel a shared foreground request merely because a navigation occurred.
- [ ] Human inbox first-page query must share initial page-fetch work without replacing merged realtime/paginated cache or triggering mark-read/create/ticket requests. Reconnect and explicit refresh still fetch authoritative fresh data. If integration needs a broader redesign, report and narrow explicitly rather than pretend it is covered.
- [ ] Add scheduler under shared providers in a Suspense boundary using pathname plus search params. No additional router.refresh loop, animation gate, media downloader, local persistent private cache, or new dependency.
- [ ] Re-run all affected tests and review specification first, then code quality.

## Task 3: Browser verification and release
Files: create tests/e2e/navigation-warmup.spec.ts, playwright.warmup.config.ts, operations verification notes.
- [ ] Controlled production-browser test intercepts account, feed, inbox and profile first-page endpoints. Record first-content timing and request order before/after implementation, not an assumed speed-up.
- [ ] Verify cached content visible on first target visit, no duplicate successful first-page requests, early click in-flight sharing, preserved content on background failure, no warmup on save-data/offline and correct account isolation.
- [ ] Cover Chromium, WebKit, Firefox. Check return navigation and inner scroll restoration; fix only demonstrated regressions.
- [ ] Run relevant unit suites, production build, diff checks and reviewer checks. Document existing unrelated test failures separately with baseline evidence.
- [ ] Stage only task files; commit/push existing authorized branch. Verify ai-parter-v1-web deployment and exact deployed manifest/HTML, then provide existing test URL. Do not claim universal actual-device coverage.

## Review checklist
- [ ] No global startup barrier or business writes.
- [ ] Query identity and result shapes match actual consumers.
- [ ] Failures do not replace successful caches.
- [ ] Logout cancels work and prevents late private cache resurrection.
- [ ] Foreground work takes priority and entry route is not delayed.
