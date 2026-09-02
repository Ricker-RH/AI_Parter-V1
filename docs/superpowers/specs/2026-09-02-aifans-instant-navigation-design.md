# AIFANS Instant Navigation Design

## Goal

AIFANS navigation and social interactions must feel as responsive as a mature social Web product: the destination reacts within 100 ms, shared chrome never flashes or remounts unnecessarily, cached or fallback content appears immediately, and fresh data streams or revalidates without blocking the route transition.

## Evidence and root cause

- The Web application already uses Next.js 16.3.3, so the framework supports Cache Components, Partial Prefetching, private browser caching, Suspense streaming, and instant-navigation validation.
- `fetchAifansApi` currently forces every request to `cache: 'no-store'`, including public feed, public post, public profile, and search reads.
- Warm public feed requests measured about 0.60–0.87 seconds TTFB; a cold request measured about 1.86 seconds. Vercel reported `x-vercel-cache: MISS` and `public, max-age=0, must-revalidate`.
- The observed request path entered through Singapore and executed in US East. This latency cannot be removed by loading indicators.
- Like, bookmark, follow, comment, and notification mutations call `router.refresh()`, causing broad route refetches after already providing local feedback.
- Existing `loading.tsx` files and `NavigationFeedback` improve acknowledgement but do not remove the blocking fetch chain.

## Navigation architecture

- Adopt Next.js Cache Components first, then Partial Prefetching. Migration is route-by-route; routes that are not yet migrated explicitly remain blocking rather than receiving unsafe caching.
- The locale layout, navigation, contextual header, and fixed social surface form the immediately available App Shell.
- Each route places uncached or request-time data below the smallest useful Suspense boundary. A public feed wait must not block the navigation/header shell; session resolution must not block public content.
- Core navigation links prefetch the route App Shell. URL-specific, high-intent destinations use per-link prefetching only where its server cost is justified.
- Preserve recent route DOM/state with the Next.js Activity behavior: feed scroll and search input survive back/forward, while transient menus and dialogs reset when hidden.

## Data classes

### Public reusable data

Home feed, public post detail, public IP profile, public search results, and search recommendations use `use cache` with explicit `cacheLife` and `cacheTag` values. Time-based expiry uses stale-while-revalidate: stale content renders immediately while regeneration occurs in the background.

Tags are narrow and non-sensitive, for example `feed:for-you:zh-CN`, `post:<uuid>`, `profile:<uuid>`, and normalized search-result tags that do not contain secrets or user identifiers.

### Session and owner-scoped data

Session reads use `use cache: private` or an equivalent per-browser private scope and sit behind Suspense. Owner-scoped datasets may use a server cache keyed by the authoritative internal profile UUID only when authorization is resolved server-side before entering the cache. Tokens, cookies, emails, and raw personal data never appear in cache keys or tags.

### Live data

Chat streams, pending mutation state, and other truly live values remain uncached. Notifications and message summaries may use a short private stale interval with background refresh; message bodies append incrementally.

## Mutation and refresh model

- Like, bookmark, and follow use immediate optimistic state and count changes. A failed request rolls back only that state.
- A successful comment appends the API-returned real comment to the visible list. It does not refresh the entire route.
- Notification read state updates locally.
- Successful mutations invalidate only affected public/private tags. Admin publish/edit/delete operations invalidate feed, post, profile, and search tags relevant to the changed entity.
- `router.refresh()` remains only for explicit user-requested retry/refresh operations where a full route refresh is intentional.

## Deployment and regional behavior

- Public cacheable payloads should be served at or near the requesting Vercel edge after the first fill.
- Web/API execution and Neon remain co-located for uncached database work. Region changes are made only after measuring the deployed topology; moving compute away from Neon is not an acceptable latency optimization.
- The design targets mature-product perceived responsiveness globally. It does not claim that a single-region database can match a hyperscale social network's raw multi-region write latency.

## Rollout

1. Add production-navigation measurements and an explicit route/data inventory.
2. Enable Cache Components with manual instant-navigation validation and migrate the shared shell plus anonymous Home.
3. Enable Partial Prefetching after the Home route is structurally valid.
4. Migrate Search, public Post detail, and public IP profile.
5. Replace broad refreshes with optimistic social mutations and precise invalidation.
6. Migrate Liked, Saved, Profile, Messages, and Notifications with private/live boundaries.
7. Validate regional execution, public cache hits, and cold/warm behavior on the stable preview deployment.

Each stage must build, pass its route tests, and deploy independently. A failed migration stage is reverted without affecting previously validated routes.

## Verification

- Pointer or keyboard navigation produces visible destination feedback within 100 ms.
- Warm navigation into core routes immediately renders the destination App Shell.
- Public cache hits avoid the current 0.60–1.86 second API wait on repeat reads.
- Like, bookmark, follow, comment, and notification-read interactions do not cause full route refetches.
- Back/forward restores feed scroll and search state; transient menus do not reopen.
- Authentication and owner-scoped data never leak between users or into public caches.
- Automated instant-navigation tests cover direct visits and client transitions in a production-capable build.
- PostHog records interaction, shell/fallback, and ready timing per route and release.
