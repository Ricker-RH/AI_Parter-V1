# Platform operator database foundation report

## Scope and TDD evidence

- Preserved migrations `202608310001` through `202609010016` byte-for-byte.
- RED contracts: the focused social contract test failed because `CreateIpSchema`, `CreatePostSchema`, and `CreateIpCommentSchema` did not exist.
- GREEN contracts: strict trimmed inputs reject unknown operator/source/state/media fields and reuse `PublicIpSchema`, `FeedPostSchema`, and `PublicCommentSchema` as strict response schemas.
- RED PostgreSQL: all five initial platform integration cases failed because `createPlatformSession`, `createPlatformSocialRepository`, and `aifans_platform` did not exist.
- GREEN PostgreSQL: the expanded platform suite passes 7/7, including required platform URL behavior, non-operator/revoked-operator denial, active operator success, safe projections, attribution, public feed visibility, one-level/same-post/public-state validation, forced audit/outbox rollback, and direct-write denial.

## Security and transaction boundary

- `202609010017_platform_social_commands.sql` creates a `NOLOGIN`, non-superuser, non-`BYPASSRLS` `aifans_platform` capability role and grants only schema usage plus three bounded command functions.
- `202609010018_platform_role_hardening.sql` idempotently reasserts the safe role attributes even if infrastructure pre-created the role.
- `createPlatformSession` requires `DATABASE_PLATFORM_URL`, accepts an injectable pool for tests, begins a transaction/savepoint, sets only `aifans_platform`, and installs only the verified JWT subject. It never reads or falls back to `DATABASE_ADMIN_URL` or an owner pool.
- The database derives the active human operator from `app.current_auth_subject()` plus an unrevoked `profile_roles.operator` membership. Client inputs cannot select operator IDs, generated IDs, source, state, timestamps, or environment.
- Each command is one database statement and transactionally writes the visible row, workflow transition, operator audit, allow-listed business event, and PostHog outbox row. Forced audit/outbox failures leave no visible IP/post.
- History payloads contain only IDs, request correlation, fixed `admin` source/environment, event name/version, and represented IP/post IDs. Tests assert post/comment bodies are absent.
- Platform role table `INSERT` privileges are false for profiles/posts/comments; command function execution is true only on the three fixed signatures.

## Domain invariants

- IP creation generates a platform-owned public/enabled IP, immutable identity revision version 1, and current revision pointer.
- Post publication requires a public/current/enabled IP and publishes nonblank text only with `source='admin'` and the derived acting operator. It creates no media rows.
- IP comments require a public target post and public/current/enabled represented IP. Replies must use a published parent on the same post and cannot exceed one reply level.
- Responses are parsed through existing strict public schemas and expose no auth subject, acting operator, audit, or private fields.

## Verification

- Fresh temporary PostgreSQL database migration `001 -> 018`: passed; temporary database removed afterward.
- Full DB suite on the fresh database: `52 passed`, `5 skipped` (environment-gated).
- Contracts: `6 passed`.
- Contracts and DB typecheck/build: passed.
- Workspace typecheck: 5/5 packages passed.
- Workspace build: 5/5 packages passed, including Next.js production build.
- `git diff --check`: passed.
