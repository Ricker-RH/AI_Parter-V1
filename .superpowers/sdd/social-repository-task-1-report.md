# Social repository task 1 report

- Red: `packages/db/tests/social-repository.test.ts` initially failed because `src/social.ts` did not exist.
- Green: contracts, cursor codec, actor-scoped repository seam, and forward-only bounded social commands are present.
- Local migration: `202609010004_social_commands.sql` applied only to the Docker database at `127.0.0.1:55432`; no hosted database was used.
- Verification: focused repository and contract tests, workspace tests, DB typecheck/build, license check, and `git diff --check` passed.
- Security: command functions derive the human actor from `app.current_auth_subject()`, use fixed empty search paths, revoke `PUBLIC`, and grant execution only to `aifans_authenticated`.

## Repository hardening review

- RED evidence: the real PostgreSQL repository suite initially failed six cases: hidden-IP likes were accepted, deleted comment bodies crossed the SQL boundary, created human comments were projected as IP authors, concurrent notification reads returned `null`, request correlation was replaced by repository-generated UUIDs, and notification cursors lacked a shared strict codec. The first exact-score test returned `9` instead of `496750`; after adding the absolute time term, the existing microsecond pagination test exposed an infinite-precision numeric cursor loop, fixed forward-only by rounding the epoch-hour term to six decimals while retaining the database anchor.
- Forward migrations only: `202609010013_social_repository_hardening.sql`, `202609010014_social_for_you_score.sql`, and `202609010015_social_score_cursor_precision.sql`. Migrations `001` through `012` were not edited.
- Public projection: `social_public_comments` now requires a published post owned by a published IP with a current revision, filters non-public IP comment authors, and returns `NULL` for deleted bodies while retaining the placeholder.
- Command boundary: authenticated callers can execute only the new bounded follow/like/comment overloads. They supply business target/body/parent plus `request_id`; the database derives the actor, generates comment/event/outbox/notification IDs, fixes `environment='api'`, and writes the mutation/event/outbox/notification atomically. Authenticated execution on all previous broad overloads is revoked.
- Visibility: the shared published-post predicate now includes public/current IP identity, enforcing the same target visibility for like, bookmark, and human-comment writes.
- Contracts/repository: notification cursors use strict canonical base64url, ISO timestamp, UUID, kind/version, and unknown-key rejection; failures normalize to `INVALID_CURSOR`. `CommandContext` is exported and required by follow/like/comment methods. Human comments return a human author. Notification read uses update-first with a select fallback for concurrent idempotency.
- Ranking: the exact stable score is `round(epoch_hours, 6) + feed_weight + followed*100 + locale_match*10 + likes*2 + published_comments*3`; tests cover exact components, personalized ordering, and microsecond cursor continuation.
- History: business-event and PostHog outbox inputs are strict discriminated unions with event-specific subject/property/payload combinations.
- Verification on local PostgreSQL (`127.0.0.1:55432`): focused social repository `14/14`; full DB `44 passed` with five environment-gated skips; contracts `5/5`; contracts and DB typecheck/build all exited `0`; `git diff --check` exited `0`.

### Bounded relationship toggle follow-up

- RED evidence: hidden bookmarks returned RLS `42501` instead of the required not-found semantic, direct deletes could silently return false for missing/hidden targets, and authenticated still held direct `INSERT`/`DELETE` grants on `follows`, `post_likes`, and `bookmarks`. A visible direct unfollow also demonstrated the brittle table-privilege boundary by failing on `DELETE ... RETURNING`.
- Forward migration: `202609010016_bounded_relationship_toggles.sql` adds `unfollow_profile`, `unlike_post`, `bookmark_post`, and `unbookmark_post` as bounded `SECURITY DEFINER` commands. Each derives the current human actor, validates the same public/current target projection, returns an idempotent boolean, and maps hidden/missing targets to PostgreSQL `P0002`.
- Direct authenticated `INSERT`/`DELETE` privileges are revoked from all three relationship tables; required owner `SELECT` on likes/bookmarks remains available.
- Verification: real PostgreSQL focused social repository `15/15`, including hidden/missing `P0002`, visible double-call idempotency, and privilege assertions.
