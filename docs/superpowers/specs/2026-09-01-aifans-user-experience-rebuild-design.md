# AIFANS Ordinary User Experience Rebuild

**Date:** 2026-09-01
**Status:** Awaiting final written-spec review
**Scope:** Ordinary user Web only. Creator Center and Admin keep their independent structures except for narrowly required handoffs and moderation dependencies.

## Goal

Rebuild the AIFANS ordinary user experience into a mature, restrained, bilingual social Web product with interaction density and responsive behavior informed by Threads, while preserving AIFANS product rules and existing security boundaries.

The rebuild must improve four concerns together:

1. responsive UI and interaction detail;
2. real end-to-end behavior behind every exposed action;
3. navigation and loading performance;
4. complete automated and real-browser verification.

This is not a proprietary Threads source or asset copy. AIFANS keeps its own brand, code, domain model, typography choices, icons, and product semantics.

## Chosen approach

Three approaches were evaluated:

1. **Page-by-page CSS patching:** fastest initial visual change, but it preserves the current monolithic shell, inconsistent responsive rules, blocking data boundaries, and incomplete action semantics.
2. **Route-aware rebuild inside the current stack:** rebuild the ordinary-user shells and vertical features while reusing the proven Next.js, React, contracts, database roles, social projections, and UI primitives.
3. **Full Threads-style architecture including multi-column Home:** closest feature breadth, but it introduces persistent column configuration, independent data sources, concurrency, horizontal navigation, and much larger performance risk before the single-column experience is stable.

Approach 2 is selected. Approach 1 cannot meet the consistency and performance acceptance gates. Approach 3 is deferred until the rebuilt single-column product has production evidence.

## Product invariants

- Only platform-controlled AI/IP accounts publish top-level posts.
- Human users cannot open a post composer. The mobile center `+` opens Creator Center/IP creation.
- Human users may browse public posts within Home and, after authentication, open other routes and like, save, follow, comment, or chat with an AI/IP.
- Creator Center does not grant creators the ability to operate or publish as an IP.
- Admin retains its independent Admin Shell and manual IP/post/comment operations.
- Creator and Admin navigation never falls back into the ordinary user shell internally.
- Realistic and anime IPs may be mixed in a feed. The only visual-type filters are All, Realistic, and Anime; All already represents mixed content.
- IP profiles with a creator show `Created by @creator`.
- Dify remains behind the AIFANS API seam. When unconfigured, chat remains safely unavailable.
- Production uses real Neon, R2, PostHog, and configured provider data. No production mock data is introduced.
- Existing authentication, database roles, RLS, rate limits, audit records, and upload validation may be strengthened but never weakened.
- Chinese and English message files always have exactly matching keys.

## Secrets and external access

- Local design, static analysis, and unit work proceed without production credentials.
- Before a Vercel, Neon, R2, PostHog, Dify, or authentication-provider operation needs external access, the implementation reports the exact credential type, purpose, minimum permission, target environment, and expected duration.
- Preview, short-lived, and read-only credentials are preferred whenever they can complete the verification.
- Passwords, connection strings, tokens, and platform keys are placed only in approved local or platform environment-variable stores.
- Secrets are never committed, copied into design or plan documents, inserted into test fixtures, printed in command output, or echoed in user-facing responses.

## Delivery decomposition

The program is too large for one safe implementation batch. It is divided into independently testable vertical slices. Each slice ships UI, behavior, security, localization, tests, and browser verification together.

### Slice 0: security and performance baseline

- Align the Web chat proxy with the social proxy's same-origin/CSRF validation.
- Apply explicit request-body limits to chat requests.
- Establish a trusted client-rate-limit identity path between Vercel Web and API and layer authenticated profile limits on write actions.
- Add navigation timing, Web Vitals, and route/error observability without capturing private content.
- Add Playwright infrastructure and deterministic local test configuration.
- Record baseline route and SQL measurements before optimization.

### Slice 1: route-aware shells, guest access, Auth, Home, and loading

- Introduce route-aware Public, Auth, Messages, Creator, and Admin shell composition.
- Rebuild desktop, compact, tablet, and mobile navigation.
- Allow anonymous public Home browsing while centrally gating protected routes and actions.
- Rebuild the full-page authentication family.
- Add full-screen entry loading, route skeletons, Suspense boundaries, errors, and navigation feedback.
- Rebuild the Home feed and post-card presentation using existing real feed data.
- Remove blocking refresh behavior where targeted cache/data updates can preserve the current view.
- Optimize the measured Home request and media-query path.

### Slice 2: discovery, profiles, post detail, liked, and saved

- Add real search contracts, API queries, database projections, and Web states for AI/IP profiles and posts.
- Complete the current human profile read/edit experience without adding human publishing.
- Refine AI/IP public profiles and creator attribution.
- Add a post-detail header with reliable back navigation and scroll restoration.
- Add the private Liked list from the existing `post_likes` relationship.
- Refine the existing private Saved list and unify both collections with the feed-card projection.
- Add native share/copy-link feedback and only the context-menu actions supported by this slice.

### Slice 3: persistent AI/IP conversations

- Implement AIFANS-owned conversation, participant, message, delivery, and read-state records in Neon.
- Scope every conversation to the authenticated human owner and an AI/IP participant.
- Add conversation list and history APIs, provider conversation mapping, pagination, and safe retry semantics.
- Stream Dify responses through the AIFANS API boundary when configured.
- Build the Threads-informed two-pane desktop layout and list/detail mobile flow.
- Do not add human-to-human direct messages or Threads-style stranger-message semantics.

### Slice 4: activity, notifications, reports, menus, settings, and support

- Redesign the human notification projection so IP analytics/audit activity is not incorrectly exposed as a human inbox.
- Human notifications cover events meaningful to the current human, such as replies and supported comment interactions; creator/operator activity remains in its appropriate product surface.
- Add a real report lifecycle with database records, narrow commands, RLS, rate limits, deduplication, audit, and a minimal Admin moderation consumer.
- Complete global More, page, and post context menus with only working actions.
- Add appearance, settings, contact, legal, not-found, offline, retry, and provider-disabled states.
- Defer mute, block, not-interested ranking, and multi-column Home until separately designed.

### Slice 5: integrated release verification

- Run the complete unit, contracts, API, database/RLS, integration, E2E, accessibility, localization, build, and performance gates.
- Inspect real authenticated and anonymous flows in desktop and mobile browsers.
- Verify production behavior against Vercel/Neon/R2/PostHog configuration without exposing secrets.

## Responsive architecture

The shell changes at measured layout thresholds rather than arbitrary device labels:

- below `700px`: mobile architecture;
- `700px` through `1149px`: compact icon rail;
- `1150px` and above: full text sidebar;
- the primary feed column is `640px` maximum;
- desktop post horizontal padding is `24px`;
- mobile post horizontal padding is `12px`;
- post avatars are approximately `36px` with an approximately `12px` content gap.

Required browser widths are `375`, `430`, `699`, `700`, `768`, `1024`, `1149`, `1150`, and `1440` pixels. Layouts must also remain usable between those exact checks.

### Desktop at 1150px and above

The left navigation contains, in order:

1. For You;
2. Following;
3. Search;
4. Messages;
5. Notifications;
6. Liked;
7. Saved;
8. My Profile;
9. More.

The page header keeps the current destination title. Home does not repeat For You/Following as an inner tab row. Its only inner filters are All, Realistic, and Anime.

The More menu contains Appearance, Settings, Contact Us, and Sign Out. Sign Out is shown only for an authenticated account. Protected entries send an anonymous visitor to Auth.

### Compact desktop and tablet from 700px to 1149px

The information architecture remains the same but the navigation defaults to an icon rail. Mouse hover and keyboard focus open a label overlay without pushing the content column. Touch devices provide an explicit tap target and never depend on hover.

### Mobile below 700px

The global top bar is:

- left: More;
- center: AIFANS or a contextual detail title;
- right: Search or the page-specific action.

The bottom navigation is:

1. Home;
2. Messages;
3. `+` for Creator Center/IP creation;
4. Activity Center;
5. My Profile.

Activity Center uses a segmented control for Notifications, Liked, and Saved.

Home has exactly one primary tab row. Each tab owns and displays its filter:

- `For You · All|Realistic|Anime`;
- `Following · All|Realistic|Anime`.

Each feed remembers its own selected visual type. Selecting the suffix opens a small local menu with All, Realistic, and Anime. There is no independent third filter row. An anonymous visitor may use the For You visual-type filter, but selecting Following opens full-page Auth.

## Guest and authentication behavior

Anonymous users may:

- enter the locale Home route;
- browse the public For You feed on Home;
- switch the For You visual-type filter;

Protected destinations and mutations include Following, Search, post detail, AI/IP profile detail, Messages, Notifications, Liked, Saved, My Profile, Creator Center, like, save, follow, comment, report, and chat. They all use one centralized protection policy rather than page-specific ad hoc handling.

A protected navigation or action goes to the locale-matched full-page sign-in route with a sanitized same-origin return path. Successful authentication returns to the intended route or safe action context. Invalid or external return paths fall back to locale Home.

Auth routes use no ordinary user navigation or recommendation rail. The Auth family includes sign in, sign up, forgot password, reset password, configured/unconfigured, validation, pending, success, and failure states. The visual direction is a spacious full-page monochrome product form with strong typography, labeled fields, email/password, Google login, account switching links, and a return-to-public-Home option. It is not a modal or a small floating card.

## Loading and navigation performance

### Visible behavior

- Initial app entry displays a full-screen AIFANS wordmark only.
- The wordmark uses a restrained opacity/scale transition and honors reduced-motion settings.
- Route transitions preserve the current shell and show a structured destination skeleton.
- Feed, profile, detail, collections, notifications, and messages use content-shaped skeletons rather than generic spinners.
- Pending mutations provide immediate local feedback, prevent duplicate submissions, and recover cleanly on failure.
- Back navigation from post detail prefers browser history and falls back to locale Home when no safe history entry exists.
- Feed scroll and pagination state are restored when returning from detail where supported by the router cache.

### Performance acceptance gates

- visible click feedback: at most `100ms`;
- route skeleton visible: at most `150ms`;
- warm navigation p75: at most `800ms` under the agreed test profile;
- INP p75: below `200ms`;
- LCP p75: below `2.5s`;
- CLS p75: below `0.1`.

The gates require both lab evidence and PostHog/RUM evidence after deployment. Next.js/React remain the selected stack; the current delay is treated as a data-fetching, rendering-boundary, query-shape, and refresh-strategy problem.

All server fetches currently marked `no-store` must be reviewed individually. Public immutable/published projections may use safe revalidation and tag invalidation. Private or session-specific responses remain private and must never enter a shared cache. Authentication tokens and private relationship flags are never cached across users.

Post media must supply stable dimensions or aspect ratios to prevent layout shift. The feed's per-post media and metric query shape must be measured with staging `EXPLAIN ANALYZE` before changing indexes or denormalizing counts.

## Core page behavior

### Home

- Uses real For You and Following projections.
- Desktop feed selection lives in the sidebar; mobile uses the combined feed/type tabs defined above.
- Visual types are All, Realistic, and Anime only.
- No human composer appears.
- Empty, loading, partial failure, end-of-feed, and retry states are explicit.

### Search

- Searches only backed entities and fields; it does not simulate results.
- Initial, typing, loading, results, no-results, error, and pagination states are present.
- V1 scope searches published AI/IP profiles and published posts. Human-account discovery is deferred unless required by a separately approved public-profile model.
- Queries are bounded, normalized, rate limited, and use a database projection that does not expose private profile data.

### Post detail and comments

- The sticky header contains Back, the localized page title, and working page actions.
- The post card retains feed visual rules and supports up to four images.
- Human users may comment and reply after authentication.
- AI/IP comments continue to be created only by authorized platform operators.
- Comment-like support is deferred from the first rebuild slices even though the database table exists; no unfinished button is exposed.

### Liked and Saved

- Both are private owner-only feeds using the same post-card projection and structured loading state.
- Liked contains liked posts only, not liked comments.
- Saved is the user-facing name for the existing bookmark relationship.
- Neither list is shown on public profiles.
- Existing `post_likes`, owner RLS, and index are sufficient for Liked; the missing repository list method, cursor, contract, API, route, localization, analytics, and tests are added without a new relationship table.

### Profiles

- My Profile contains real account data and edit affordances but no top-level post tab or composer for humans.
- AI/IP profiles contain published profile data, posts/media, follow and chat entry points when available, and creator attribution.
- Follower/following directory pages require separate bounded projections; counts or links are not exposed until those projections exist.

### Messages

- At all non-mobile widths, the global navigation is forced into the compact icon rail.
- The remaining area is a two-pane conversation list and active conversation.
- Mobile uses a conversation-list route and a conversation-detail route with Back.
- The list contains AIFANS human-to-AI/IP conversations only.
- When Dify is unconfigured, existing history remains readable if available but sending is disabled with an honest state.
- Conversation provider identifiers are server-owned mappings; clients cannot claim another conversation by supplying an arbitrary provider id.

### Notifications and Activity Center

- Desktop has separate Notifications, Liked, and Saved destinations.
- Mobile groups them only at the navigation/presentation layer.
- Every underlying dataset keeps its independent loading, error, pagination, and privacy behavior.
- Notifications are marked read through authenticated narrow commands.
- IP activity needed for creator analytics or operations is not mixed into a human user's notification inbox.

### Settings and support

- Settings includes appearance, locale, account/privacy navigation, and sign-out where appropriate.
- Contact Us uses a configured public support destination. If unconfigured, it renders a safe unavailable state rather than a fake submission.
- Legal routes provide real terms and privacy content before their links are exposed.

## Menu capability model

Three visually related menus have different responsibilities.

### Global More

- Appearance;
- Settings;
- Contact Us;
- Sign Out when authenticated.

### Page menu

Only contextually useful, implemented actions appear, such as refresh, copy page link, or native share. Full multi-column pinning is hidden until the separate multi-column system exists.

### Post menu

The first complete version exposes:

- follow or unfollow the author through the existing bounded command;
- copy link;
- native share or safe fallback;
- report through the new report lifecycle.

Save remains in the post action row and is not duplicated in the menu. Mute, block, and not interested remain absent until their data, recommendation, and enforcement semantics are separately approved.

Every menu item has keyboard navigation, focus restoration, outside-click/Escape dismissal, loading/disabled behavior, localized feedback, and an implemented backend where required. No placeholder action is rendered.

## Data and security design

### Reuse without migration

- public anonymous For You projection;
- authenticated Following projection and follow/unfollow commands;
- bookmark commands and private bookmark list;
- post likes and like/unlike commands;
- published post/profile/comment projections;
- current authentication and role establishment;
- existing media upload and audit boundaries.

### New bounded read paths

- Liked feed from existing `post_likes` with a liked-specific cursor;
- search projection for published AI/IP profiles and posts;
- current human profile read/edit projection;
- follower/following directories are deferred and are not added by this rebuild.

### Required migrations in later slices

- AIFANS conversation ownership, participants, messages, delivery/read state, and provider mapping;
- corrected human notification delivery/projection without broadening IP or creator visibility;
- reports with target type, target id, enumerated reason, reporter, state, timestamps, deduplication, moderation audit, and bounded platform resolution commands.

Reports are private to the reporter and authorized moderation roles. They do not enter public social projections. Rate limits apply by authenticated profile and trusted request identity.

## Component and route boundaries

- `AppShell` becomes a route-aware shell selector, not a monolithic layout containing every route.
- Public/Home components do not import database or provider SDKs.
- Authentication policy is exposed through one route/action guard contract.
- Feed projection and PostCard remain reusable across Home, Liked, Saved, profiles, and detail.
- Menus consume declared capabilities rather than inventing actions from visual context.
- Messages UI consumes provider-neutral AIFANS conversation contracts.
- Creator and Admin shells remain isolated and receive only explicit handoff routes.

Components must remain independently testable. Large files are split only when required to isolate shell selection, navigation variants, auth guarding, data state, or action behavior; unrelated refactors are excluded.

## Error handling

- Public unavailable data produces an honest localized state and retry where safe.
- `401` on a protected destination produces Auth with a sanitized return path.
- `403` never masquerades as an empty state.
- `404` distinguishes deleted/unpublished content without leaking hidden publication state.
- Rate-limit responses show a bounded retry message and never automatically hammer the API.
- Optimistic social mutations roll back on failure and announce the localized result.
- Chat preserves submitted user text across retryable transport failures and never fabricates an AI response.
- Provider-not-configured behavior is safe, stable, and testable.

## Verification strategy

Each slice starts with failing tests for the behavior being added and finishes with focused and global evidence.

Performance runs use both normal network conditions and a controlled Slow 4G plus 4x CPU profile. Feed cases include empty data, 25 posts, 50 posts, media with intrinsic dimensions, and the safe fallback for legacy media without dimensions. Each performance matrix cell records at least ten warm samples and reports p50, p75, p95, failure rate, commit, browser, viewport, network, and CPU conditions rather than an average alone.

### Automated layers

- component tests for shell variants, navigation, menus, loading, empty/error states, focus, and guest gating;
- contract tests for every new request/response and cursor;
- API tests for authentication, strict input, rate limits, same-origin checks, and error mapping;
- database repository and RLS tests for private lists, search projections, conversations, notifications, and reports;
- integration tests for Web proxy-to-API behavior;
- Playwright tests for anonymous, authenticated, mobile, desktop, light, and dark journeys;
- exact Chinese/English key parity;
- typecheck, production build, license/asset scan, and `git diff --check`.

### Critical journeys

1. anonymous Home browsing, type filtering, protected action to Auth, successful return;
2. warm Home-to-profile-to-post navigation and Back scroll restoration;
3. like, save, follow, comment, and failure rollback;
4. private Liked and Saved lists inaccessible to another account;
5. search results, no results, rate limiting, and unavailable state;
6. conversation list, send/stream/retry/history, and Dify-unconfigured behavior;
7. human notification delivery and read state without creator/IP leakage;
8. report submission, deduplication/rate limiting, and authorized moderation review;
9. mobile Activity Center switching among independent Notifications, Liked, and Saved data;
10. Auth, Creator, and Admin shell isolation.

### Real-browser review

- inspect all required widths in Chinese and English;
- inspect light and dark themes;
- verify keyboard-only navigation, visible focus, menu dismissal, and touch targets;
- verify no horizontal overflow, clipped menu, or hover-only essential action;
- verify real empty states without seeded product content;
- capture performance traces and screenshots for the implemented slice.

## Explicitly deferred

- Threads-style multi-column Home, column pinning, reorder, independent auto-refresh, and horizontal multi-column browsing;
- mute, block, and not-interested recommendation semantics;
- human-to-human direct messages and stranger-message requests;
- liked comments in the Liked page;
- automatic AI/IP publishing or creator operation of an IP;
- unrelated Creator Center and Admin visual redesign;
- speculative mock content or placeholder backend engines.

## Completion definition

The rebuild is complete only when every exposed ordinary-user action has a real, permission-safe implementation; every core page has localized loading, empty, success, and failure behavior; responsive browser review passes at all required widths; the performance gates have measured evidence; the automated suite, database/RLS tests, typecheck, and production build pass; and no secret or private user data enters Git, shared caches, analytics payloads, or public projections.
