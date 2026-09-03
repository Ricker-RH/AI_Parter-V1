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
- `idempotency_key uuid` supplied by the browser for command idempotency;
- `created_at timestamptz` with the database default.

Add an index beginning with `post_id` for bounded count lookups and an explicitly named unique constraint on `(post_id, idempotency_key)`. The key is scoped to the post so one malformed client cannot suppress an unrelated post's event by reusing a key. Do not store API request IDs, client IP, user agent, destination application, copied URL, or other browser metadata.

Add a security-definer `record_post_share(post_id, idempotency_key)` command granted to the existing anonymous and authenticated application roles. It must:

- reject posts outside the public current projection with the same not-found semantics as other post commands;
- lock and validate the post and its IP profile in the established post → IP order before inserting, so a concurrent withdrawal or unpublish cannot win the visibility change and still leave a new share event;
- derive the optional actor from the database session rather than accepting an actor identifier;
- insert at most once for the same post and idempotency key, using an explicit constraint target and unambiguous SQL variable names;
- return whether a new event was created;
- preserve the existing locked search path and privilege pattern.

The same migration replaces `platform_publish_ip_comment` in place, without changing its signature, grants, authorization, validation, writes, or return shape, so it acquires the published target post first and then locks the target-author and represented IP rows in canonical UUID order. `create_human_comment` already uses post → IP. Keeping all three commands on that global order prevents share/comment deadlocks while retaining deterministic ordering when the platform command touches two IP profiles.

### Counts

Extend the existing bounded post-metrics projection with:

- `bookmark_count`, calculated from `bookmarks` by `post_id`;
- `share_count`, calculated from `post_share_events` by `post_id`.

The bookmark rows themselves remain owner-private. Only their aggregate total becomes public. Existing feed ranking remains unchanged; bookmark and share counts are display metrics, not new ranking weights in this change.

## Contract and repository design

Extend the strict `FeedPost` contract with required non-negative integers `bookmarkCount` and `shareCount`. Every producer—feed, following, liked, bookmarks, search, public profile, and post detail—must populate both fields. No compatibility fallback or optional field is permitted inside application code; missing producer updates should fail contract tests.

Extend the social repository/port with a `recordPostShare(viewer, postId, idempotencyKey)` command. The viewer is optional so the already-public share button behaves consistently for signed-in and signed-out users. Repository tests must prove both actor modes, post-scoped idempotency, concurrent visibility changes, hidden-post rejection, and correct aggregate counts.

## API and Web BFF design

Add `POST /v1/posts/:postId/share` with an empty body or strict empty JSON object, optional authentication, a required UUID `Idempotency-Key` header, public-post validation, and the existing mutation rate-limit identity. Body presence is determined from the request stream, not from text length. An absent stream needs no content type; when a stream exists, its parsed media-type essence must equal `application/json` exactly (a valid `charset=utf-8` parameter is allowed) before blank content or strict `{}` is processed. Thus empty or whitespace `text/plain`, `application/jsonx`, and `application/jsonp` are rejected before the repository is called. The body remains within the global body limit. The API validates the idempotency key independently and passes it to the repository. Its existing server-generated request ID remains correlation-only and is never used as the share deduplication key. The route returns a strict `{created: boolean}` response, and database constraint details stay redacted by the normal error mapper.

Allow the same path through the Web BFF only for same-origin `POST` requests with no query string, a valid UUID `Idempotency-Key`, and an empty JSON object or empty body. It independently applies the same body-stream and exact media-type rules before any upstream call. The BFF validates the key before transport and passes it to `fetchAifansApi` through a dedicated trusted option; it must never widen the generic inbound-header allow-list. Continue stripping untrusted authorization, cookie, forwarding, and rate-limit headers; the BFF supplies its server token when present and its signed rate-limit identity. Responses are `private, no-store`.

No endpoint exposes individual bookmark owners or share-event rows.

## Web interaction design

All four actions render a numeric value, including `0`, in feed and detail variants. Accessible labels include the authoritative count in the detail variant and preserve the existing concise feed labels.

- Like keeps its current optimistic toggle and exact rollback behavior.
- Bookmark gains the same optimistic count update and rollback behavior as like.
- Share invokes native sharing when available, otherwise copies the canonical post URL. Cancellation is neutral and records nothing.
- After a successful share/copy, the client generates one UUID idempotency key and posts the share command. A bounded retry of that recording request reuses the same key and never invokes the native share/copy flow twice. A valid `{created:true}` or `{created:false}` response acknowledges that this locally completed action is durably represented; the client increments its visible count exactly once after that acknowledgement. Exhausted retryable failures show the existing interaction error without claiming a count that the server did not confirm.
- A pending action is disabled only for its own request. Like, bookmark, and share errors remain independently scoped.
- Viewer/post identity changes reset all optimistic state from new authoritative props, preserving the current stale-request protections.

## Security and abuse controls

- Same-origin validation remains mandatory at the Web BFF.
- API rate limiting applies to anonymous and authenticated share recording.
- IDs are validated UUIDs; bodies and query strings are rejected unless explicitly allowed.
- The share ledger stores no network identifier. Existing signed rate-limit identity is ephemeral enforcement data, not persisted interaction data.
- Counts use non-negative integer schemas and database aggregates; clients cannot submit count values.
- Browser-generated UUID idempotency keys make recording retries idempotent. Each separate completed native share/copy creates a new key, while the API request ID remains tracing metadata only.

## Testing and verification

### Automated

- DB migration/integration: like → unlike → like succeeds, count returns to one, only one historical notification exists, and two business/outbox events exist.
- DB share tests: authenticated and anonymous shares, repeated post/key pairs, the same key on different posts, separate successful shares, hidden/missing post rejection, withdrawal/unpublish races, share-versus-platform-comment and share-versus-human-comment lock-order probes with no `40P01`, reliable committed-fixture cleanup, and count projection.
- Contract tests: all strict post payloads require both new counts and reject negative/non-integer values.
- API tests: optional auth, missing/invalid idempotency keys, invalid IDs/query/exact media type/body/oversized body, including body-stream edge cases, rate-limit identity path, strict response, not-found/error redaction, and proof that rejected inputs never reach the port.
- Web BFF tests: allowed path, same-origin requirement, exact body-stream/media-type validation, idempotency-key validation and trusted forwarding, header hygiene, response validation, cache policy, and proof that rejected inputs never reach upstream transport.
- Component tests: zero rendering, bookmark optimistic update/rollback, successful share count, same-key recording retry, cancelled share, exhausted/invalid recording, stale request/post reset, and accessible labels.
- Full repository tests, DB integration tests, typecheck, production builds, migration/license checks, and `git diff --check`.

### Preview acceptance

After applying the forward migrations and deploying the final branch SHA:

1. Verify like → unlike → like on a real test post with no error and correct count after refresh.
2. Verify bookmark add/remove updates the count and the private Bookmarks collection.
3. Verify cancelled native share does not change the count.
4. Verify completed native share or successful copy changes the share count and persists after refresh.
5. Verify signed-out sharing is counted without creating an account.
6. Force one ambiguous recording failure and verify the retry reuses the same idempotency key, does not reopen native share/copy, and stores and displays exactly one increment.
7. Spot-check feed, search, collections, profiles, and detail at 430, 768, 1024, and 1440 pixels in light and dark themes.
8. Confirm no application console errors and no new 5xx interaction logs.

## Non-goals

- Repost/quote-post functionality.
- Exposing who bookmarked or shared a post.
- Adding bookmark/share signals to feed ranking.
- Capturing the destination app or proving that a recipient opened the shared link.
- Backfilling historical browser shares that were never recorded.
- Changing platform-comment behavior, permissions, payloads, or audit/event semantics beyond the required lock-order normalization.
