# Social Interaction Counts and Re-like Reliability Design

**Date:** 2026-09-03

## Goal

Make post interactions production-grade across the Web Preview:

- a human can like, unlike, and like the same published post again without a database error;
- like, comment, bookmark, and share actions display authoritative counts, including zero;
- bookmark and share counts are backed by durable server data rather than placeholders;
- a share is counted only after the browser reports a completed native share or a successful link copy;
- retries are idempotent, private bookmark ownership stays private, and anonymous share events do not store IP addresses.

## Evidence and root cause

The affected post first returned `200` for `DELETE /like`, then returned `500` for every later `PUT /like`. The API log reports PostgreSQL `23505`.

`unlike_post` deletes the row from `post_likes` but intentionally preserves the historical notification. `like_post` then recreates the relationship and inserts another `post_like` notification. The partial unique index `notifications_post_like_once_idx` rejects that second notification, rolling back the entire transaction. Existing tests cover duplicate likes and duplicate unlikes separately, but not the sequence like → unlike → like.

Bookmark and share counts are a separate missing capability. `FeedPost` currently exposes only `likeCount` and `commentCount`; bookmark actions have no count projection, and sharing only calls the browser without recording a server event.

## Considered approaches

### 1. UI-only zeros

Render `0` beside bookmark and share without adding server data. This is small but misleading and cannot survive refreshes. Rejected.

### 2. Analytics-only share totals

Read share counts from an external analytics provider while keeping post data in PostgreSQL. This introduces eventual consistency, joins two availability domains into the feed, and makes tests and local development fragile. Rejected.

### 3. Transactional interaction projection (selected)

Keep relationship and share facts in PostgreSQL, expose all four counts through the existing post projection, and record a share through a bounded API command only after browser success. This preserves a single authoritative read model and follows the existing repository/API/BFF architecture.

## Database design

### Re-like repair

Add a forward-only migration that replaces the two-argument `like_post` function without changing its signature or grants. Its notification insert uses the existing partial uniqueness contract and `ON CONFLICT DO NOTHING`. A re-like still creates a fresh `post_likes` relationship, business event, and analytics outbox event, but does not create a duplicate notification.

The migration must not delete notification history or relax the unique index.

### Share event ledger

Add `post_share_events` with:

- `id uuid` primary key;
- `post_id uuid` referencing `posts`;
- nullable `actor_profile_id uuid` referencing `profiles`;
- `request_id uuid` unique for command idempotency;
- `created_at timestamptz` with the database default.

Add an index beginning with `post_id` for bounded count lookups. Do not store client IP, user agent, destination application, copied URL, or other browser metadata.

Add a security-definer `record_post_share(post_id, request_id)` command granted to the existing anonymous and authenticated application roles. It must:

- reject posts outside the public current projection with the same not-found semantics as other post commands;
- derive the optional actor from the database session rather than accepting an actor identifier;
- insert at most once for the same request ID;
- return whether a new event was created;
- preserve the existing locked search path and privilege pattern.

### Counts

Extend the existing bounded post-metrics projection with:

- `bookmark_count`, calculated from `bookmarks` by `post_id`;
- `share_count`, calculated from `post_share_events` by `post_id`.

The bookmark rows themselves remain owner-private. Only their aggregate total becomes public. Existing feed ranking remains unchanged; bookmark and share counts are display metrics, not new ranking weights in this change.

## Contract and repository design

Extend the strict `FeedPost` contract with required non-negative integers `bookmarkCount` and `shareCount`. Every producer—feed, following, liked, bookmarks, search, public profile, and post detail—must populate both fields. No compatibility fallback or optional field is permitted inside application code; missing producer updates should fail contract tests.

Extend the social repository/port with a `recordPostShare(viewer, postId, requestId)` command. The viewer is optional so the already-public share button behaves consistently for signed-in and signed-out users. Repository tests must prove both actor modes, request idempotency, hidden-post rejection, and correct aggregate counts.

## API and Web BFF design

Add `POST /v1/posts/:postId/share` with an empty body, optional authentication, the existing request ID, public-post validation, and the existing mutation rate-limit identity. It returns a strict `{created: boolean}` response. Database constraint details must stay redacted by the normal error mapper.

Allow the same path through the Web BFF only for same-origin `POST` requests with no query string and an empty JSON object or empty body. Continue stripping untrusted authorization and rate-limit headers through `fetchAifansApi`; the BFF supplies its server token when present and its signed rate-limit identity. Responses are `private, no-store`.

No endpoint exposes individual bookmark owners or share-event rows.

## Web interaction design

All four actions render a numeric value, including `0`, in feed and detail variants. Accessible labels include the authoritative count in the detail variant and preserve the existing concise feed labels.

- Like keeps its current optimistic toggle and exact rollback behavior.
- Bookmark gains the same optimistic count update and rollback behavior as like.
- Share invokes native sharing when available, otherwise copies the canonical post URL. Cancellation is neutral and records nothing.
- After a successful share/copy, the client posts the share command. It increments the visible count only after a valid successful response. A failed record shows the existing interaction error without claiming a count that the server did not store.
- A pending action is disabled only for its own request. Like, bookmark, and share errors remain independently scoped.
- Viewer/post identity changes reset all optimistic state from new authoritative props, preserving the current stale-request protections.

## Security and abuse controls

- Same-origin validation remains mandatory at the Web BFF.
- API rate limiting applies to anonymous and authenticated share recording.
- IDs are validated UUIDs; bodies and query strings are rejected unless explicitly allowed.
- The share ledger stores no network identifier. Existing signed rate-limit identity is ephemeral enforcement data, not persisted interaction data.
- Counts use non-negative integer schemas and database aggregates; clients cannot submit count values.
- Request IDs make transport retries idempotent without deduplicating separate successful user share actions.

## Testing and verification

### Automated

- DB migration/integration: like → unlike → like succeeds, count returns to one, only one historical notification exists, and two business/outbox events exist.
- DB share tests: authenticated and anonymous shares, repeated request ID, separate successful shares, hidden/missing post rejection, and count projection.
- Contract tests: all strict post payloads require both new counts and reject negative/non-integer values.
- API tests: optional auth, invalid IDs/query/body, rate-limit identity path, strict response, not-found/error redaction.
- Web BFF tests: allowed path, same-origin requirement, header hygiene, response validation, and cache policy.
- Component tests: zero rendering, bookmark optimistic update/rollback, successful share count, cancelled share, failed recording, stale request/post reset, and accessible labels.
- Full repository tests, DB integration tests, typecheck, production builds, migration/license checks, and `git diff --check`.

### Preview acceptance

After applying the forward migrations and deploying the final branch SHA:

1. Verify like → unlike → like on a real test post with no error and correct count after refresh.
2. Verify bookmark add/remove updates the count and the private Bookmarks collection.
3. Verify cancelled native share does not change the count.
4. Verify completed native share or successful copy changes the share count and persists after refresh.
5. Verify signed-out sharing is counted without creating an account.
6. Spot-check feed, search, collections, profiles, and detail at 430, 768, 1024, and 1440 pixels in light and dark themes.
7. Confirm no application console errors and no new 5xx interaction logs.

## Non-goals

- Repost/quote-post functionality.
- Exposing who bookmarked or shared a post.
- Adding bookmark/share signals to feed ranking.
- Capturing the destination app or proving that a recipient opened the shared link.
- Backfilling historical browser shares that were never recorded.
