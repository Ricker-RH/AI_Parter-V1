# Task 1 report: AIFANS secure social core schema

- Added the forward-only local PostgreSQL migration `202609010003_social_core.sql`; no hosted Neon database was used.
- RED: `social-core-rls.test.ts` failed before the migration because `public.ip_profiles` did not exist.
- GREEN: the focused real-PostgreSQL suite passes, covering human/IP write denial, current-actor interaction ownership, private bookmarks, published-only public visibility, safe column grants, and text-only published posts.
- Added matching Drizzle enums/tables and package-root exports. SQL remains authoritative for RLS, column privileges, triggers, immutable revisions, soft deletion, and deferred publish validation.

## Verification

- `pnpm --dir packages/db test -- social-core-rls.test.ts` — pass (29 tests across the DB suite).
- `pnpm --dir packages/db typecheck` — pass.
- `pnpm --dir packages/db build` — pass.
- `pnpm test` — pass (45 passed, 23 skipped).
- `pnpm license:check` and `git diff --check` — pass.

## Review notes

- Public grants intentionally exclude auth subjects, operator attribution, creator/source internals, and object keys.
- Human roles have no top-level post or IP-comment write path; bookmarks are owner-only.
- There is no seed or mock product data in the migration.

## Lifecycle hardening follow-up

- Restricted reads now have column-only grants for comments; operator attribution and source are not selectable by anonymous or authenticated users.
- Draft posts may be edited or published, while published content is immutable except for withdrawal; published/withdrawn posts cannot be hard-deleted. Comments reject hard deletion and retain soft-deleted rows.
- Published IPs require a current immutable revision belonging to that IP through a deferred composite foreign key and lifecycle trigger.
- Admin post/comment attribution requires an active human operator; worker attribution is explicitly system-only (`acting_operator_profile_id IS NULL`).
- Added focused checks for hidden comment fields, lifecycle transitions, revision immutability, soft deletion, notification ownership/read state, and published-post delete denial.

## Final invariant gate

- Added real PostgreSQL coverage for null/cross-IP identity revisions, existing cross-user relationship mutation attempts, notification read ownership, media-only/text-plus-media publication, media position bounds and media-retention validation, comment topology, whitespace, and impersonation constraints.
- Drizzle now publishes the composite current-revision foreign key in the `ip_profiles` table configuration; the database test asserts the named key is present. PostgreSQL remains authoritative for its deferred enforcement.
