# AIFANS PostHog analytics — Task 1 report

## Delivered scope

- Added a closed, typed Web analytics contract for exactly the approved 13 initial client events. Every custom event receives `event_version: 1`.
- Added domain helpers for page, feed, profile, post, chat, and Creator intent events. The runtime schema rejects unknown event names, missing required fields, non-allow-listed fields, and sensitive payload keys.
- Added a lazy PostHog browser adapter with `page`, `identify`, `reset`, and `capture`. It is a total no-op without `NEXT_PUBLIC_POSTHOG_KEY`, disables `autocapture`, `capture_pageview`, and `capture_pageleave`, uses explicit route-template page views, identifies only UUID-shaped AIFANS profile IDs, and resets identity.
- Wrapped the locale Web shell in `AnalyticsProvider`; real existing feed-post click and validated chat-open intent boundaries now emit safe events. Neither post body nor chat message enters analytics.
- Added `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` examples. `posthog-js` is exact-pinned to `1.422.5`.

## Dependency verification

- Official npm registry lookup on 2026-09-01 reported `posthog-js@1.422.5`, license `(Apache-2.0 AND MIT)`, and the lockfile’s matching SHA-512 integrity value.
- The official PostHog JavaScript Web documentation was checked for package installation, stable-ID identification, logout reset, and configuration guidance.
- `posthog-js` brings a `core-js` postinstall transitively. pnpm 11’s workspace policy explicitly sets `core-js: false`, so that script is not granted execution; `pnpm install --frozen-lockfile` completed successfully.

## TDD evidence

1. `apps/web/src/lib/analytics/analytics.test.tsx` initially failed because `./contracts.js` did not exist (expected RED).
2. The real ChatPanel and PostCard boundary tests then failed with zero analytics captures (expected RED).
3. A final missing-required-property assertion for `post_viewed` failed before the runtime schema was tightened (expected RED).
4. Each case passed after the corresponding minimal implementation (GREEN).

## Fresh verification

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | passed |
| `pnpm --filter @aifans/web test` | passed — 15 files, 69 tests |
| `pnpm --filter @aifans/web typecheck` | passed |
| `pnpm --filter @aifans/web build` | passed — optimized Next production build |
| `pnpm license:check` | passed — forbidden asset scan |
| `git diff --check` | passed |

## Initial anonymous identity preservation follow-up (2026-09-01)

- Corrected the identity gate so an initial authoritative anonymous resolution preserves PostHog's persisted anonymous distinct ID. Only a known authenticated-to-anonymous transition invokes `reset`; repeated anonymous focus refreshes do not rotate the anonymous session.
- TDD RED observed the initial `204` calling `reset` once. GREEN verifies initial/reload anonymous and unchanged focus refresh call no reset, while the existing authenticated-to-anonymous lifecycle regression still calls reset exactly once.

| Command | Output |
| --- | --- |
| `pnpm --filter @aifans/web test` | passed — 20 files, 85 tests |
| `pnpm --filter @aifans/web typecheck` | passed |
| `pnpm --filter @aifans/web build` | passed — optimized Next production build |
| `pnpm license:check` | passed — forbidden asset scan |
| `git diff --check` | passed |

## Identity attribution race and real-SDK follow-up (2026-09-01)

- Added an explicit resolving/authenticated/anonymous analytics identity gate. Product events and `$pageview` are queued while identity is unresolved; an authenticated profile is identified and awaited before the queue flushes, while an authoritative anonymous response resets the persisted SDK identity before flushing.
- The narrow account endpoint now distinguishes authoritative signed-out (`204`, derived from upstream `/v1/me` `401/204`) from unavailable (`503` for configuration, transport, timeout, upstream 5xx, or invalid schema). Unavailable resolution neither resets identity nor flushes initial queued events under a potentially stale persisted identity.
- A persistent locale layout refreshes identity on window focus and visible-document transitions. Repeated unchanged anonymous state does not repeatedly reset the anonymous session; authenticated-to-anonymous transitions do reset.
- Explicitly disabled PostHog feature flags/remote decide, toolbar metrics, surveys and automatic survey display, product tours, conversations, Web experiments, plus the previously disabled recording, exceptions, performance, autocapture, pageleave/pageview, referrer, and campaign behaviors.
- Added a real `posthog-js@1.422.5` integration regression. It creates a real `PostHog` instance, captures through SDK enrichment and the configured `before_send`, then observes the SDK's own post-sanitization `eventCaptured` hook immediately before enqueue/transport. Raw location query/token, SDK super-property email, object URL, referrer, and campaign fields are absent from the final SDK event.

### Attribution-race TDD evidence

1. RED: initial page/landing capture occurred before asynchronous identify; `503` caused reset/flush; focus did not refresh identity; account validation/transport failures returned `204`; remote products were not explicitly disabled.
2. RED: the real SDK integration initially failed because the shared init-options boundary did not exist. A first queue observation used `__request_queue`; installed SDK source showed this is the pre-init command queue, so the test was corrected to the SDK `eventCaptured` hook that runs after `before_send` and before request enqueue.
3. GREEN: all identity ordering/transitions, failure isolation, remote-disable options, endpoint distinctions, and real SDK sanitization assertions pass.

### Fresh attribution-race verification

| Command | Output |
| --- | --- |
| `pnpm --filter @aifans/web test` | passed — 20 files, 85 tests |
| `pnpm --filter @aifans/web typecheck` | passed |
| `pnpm --filter @aifans/web build` | passed — optimized Next production build |
| `pnpm license:check` | passed — forbidden asset scan |
| `git diff --check` | passed |

## Non-blocking identity and transport privacy follow-up (2026-09-01)

- Removed the analytics-only `/v1/me` await from `LocaleLayout`. Identity now loads after paint through a narrow same-origin `/api/account` endpoint, which forwards the request cookie server-side, applies strict `AccountSchema` validation, has a 1.5-second upstream timeout, returns only `{profileId}`, and treats authentication, validation, network, and timeout failures as signed out.
- Added hanging-request regressions at both boundaries: locale rendering never calls the account fetch, and the mounted provider renders its children immediately while a same-origin account request remains pending.
- Corrected the approved Creator `visual_type` contract to `realistic | anime | hybrid`.
- Added a PostHog `before_send` allow-list sanitizer for custom events, `$pageview`, and `$identify`. It revalidates AIFANS event/page schemas after SDK enrichment and drops raw URL, path, referrer, query/campaign, email, cookie, access-token, object-URL, `$set`, and `$set_once` data before transport. Only the required public PostHog ingestion token, bounded anonymous/session identifiers, safe coarse device type/time, and validated product properties survive.
- Added defense-in-depth SDK configuration: URL/campaign/PII `property_denylist`, `save_campaign_params: false`, `save_referrer: false`, `disable_session_recording: true`, full text/attribute masking, `capture_exceptions: false`, `capture_performance: false`, and all previously disabled broad automatic capture settings.

### Follow-up TDD evidence

1. Focused regressions initially failed because the same-origin endpoint was absent, layout awaited a never-resolving analytics account request, the current-account fetch had no abort signal, `realistic` was rejected, the SDK had no `before_send` or privacy hardening options, and the provider did not load identity asynchronously.
2. After the implementation, the focused command passed. A timing-based layout assertion was replaced with the stronger production-path assertion that neither cookie access nor current-account fetch is invoked by layout; the separate mounted-provider regression proves visible rendering while its request hangs.
3. SDK-hook tests execute the configured `before_send` callback against both enriched custom and `$pageview` events containing raw query/token URLs, referrers, campaign identifiers, email, cookie, access token, object URL, and person-property payloads, and assert the exact sanitized transport object.

### Fresh follow-up verification

| Command | Output |
| --- | --- |
| `pnpm --filter @aifans/web test -- src/app/'[locale]'/layout.test.tsx src/app/api/account/route.test.tsx src/lib/current-account.test.tsx src/lib/analytics/analytics.test.tsx` | passed — 19 files, 81 tests at the focused GREEN checkpoint |
| `pnpm --filter @aifans/web test` | passed — 19 files, 82 tests in the final gate |
| `pnpm --filter @aifans/web typecheck` | passed |
| `pnpm --filter @aifans/web build` | passed — optimized Next production build, including `/api/account` |
| `pnpm license:check` | passed — forbidden asset scan |
| `git diff --check` | passed |

## Scope note

No Creator component exists in this worktree outside parallel, uncommitted Creator work. To avoid overlapping that work, this task provides the Creator intent helpers but does not modify those pending files. They are ready to be called at the eventual Creator interaction boundaries.

## Review-fix wave (2026-09-01)

- Closed all value schemas: route values now use a fixed static-template union; action source, creation step, and visual type use fixed enums; search query length is capped at 256. Runtime tests reject URLs, hashes, query strings, private-content-like strings, and unsupported enum values.
- `$pageview` remains a PostHog vendor-reserved system event, not an AIFANS custom event. It can only be emitted through `createAnalyticsPage`, which validates locale and static route template and adds `event_version: 1`.
- Added a server-only current-account fetch for `/v1/me` using `AccountSchema`, forwarded request cookie, and safe signed-out fallbacks. Locale layout passes only the AIFANS account/profile UUID to the provider. Provider identifies that UUID or resets when no valid profile exists.
- Added the real client-side Home feed tabs boundary and root-route `landing_viewed` capture. Chat-open capture is now once per target/conversation and resets only when the user explicitly starts a new conversation.
- Preserved the Creator parallel-work boundary; no Creator/contracts/db worktree files were modified.

### Review-fix TDD evidence

1. New regression tests failed against the prior implementation for URL/free-form property values, unversioned page views, raw route handling, duplicate continuation chat capture, and missing current-account/feed-tab/layout boundaries.
2. The initial new test files were corrected for a test-only import/syntax issue before relying on their failures; the intended RED cases then failed for the reviewed behavior.
3. After the fixes, all Web tests passed.

### Fresh review-fix verification

| Command | Output |
| --- | --- |
| `pnpm --filter @aifans/web test` | passed — 18 files, 77 tests |
| `pnpm --filter @aifans/web typecheck` | passed |
| `pnpm --filter @aifans/web build` | passed — optimized Next production build |
| `pnpm license:check` | passed — forbidden asset scan |
| `git diff --check` | passed |
