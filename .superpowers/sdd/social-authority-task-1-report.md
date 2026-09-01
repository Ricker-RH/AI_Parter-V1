# Social authority Task 1 evidence

Base commit: `8e588e7`.

## RED → GREEN

- Added `packages/db/tests/authority-history.test.ts` before implementation.
- RED command failed as expected: authority/history exports and database objects did not exist.
- Applied only the local Docker migration `202609010002_authority_history.sql`; no hosted Neon database was used.
- GREEN: the focused test passes, covering explicit operator grants, malformed claims, restricted-role denial, append-only history rows, and atomic rollback.

## Verification

- `pnpm --dir packages/db test -- authority-history.test.ts`: pass (23 tests).
- `pnpm --dir packages/db typecheck`: pass.
- `pnpm --dir packages/db build`: pass.
- `pnpm test`: pass (45 tests, 17 intentionally skipped).
- `pnpm license:check`: pass.
- `git diff --check`: pass.

## Scope and security checks

- `DATABASE_PLATFORM_URL` is declared by name only; no value, fallback, raw pool export, user-facing route, or demo data was introduced.
- RLS is enabled and table privileges are revoked for the five new authority/history tables; `current_operator()` is a fixed-search-path security-definer function executable only by `aifans_authenticated`.
- `grantOperator` accepts only subjects, requires existing human profiles, is idempotent for an active membership, and writes its audit fact atomically.

## Hardening follow-up

- Added a RED regression suite for outbox retries/delivery/permanent failure, immutable payload protection, terminal states, and sensitive/unknown history contract fields.
- Replaced the outbox blanket append-only update trigger with a constrained state-transition guard: retry scheduling is mutable only while pending; delivery or permanent failure is terminal; event identity and payload are immutable; deletes remain rejected.
- Removed the root history-repository export. Internal writers now use strict named/versioned Zod contracts with approved audit actions, business events, property values, and PostHog destination/version only. Sensitive keys (`email`, `token`, `password`, `body`, `prompt`, `message`) are rejected before SQL runs.
- Brought Drizzle declarations in line with SQL composite keys, profile/event foreign keys, unique outbox event linkage, and supported checks.
- Recreated the local Docker test database and applied the forward migration from scratch; no hosted database was used.
- Follow-up verification: focused authority-history suite passes (25 tests); DB typecheck/build, root tests, license check, and diff check pass.

## Event allowlist follow-up

- Replaced the persisted JSON `z.record` validator with strict, explicit V1 contracts only: `operator_granted` audit summaries carry `{ role: 'operator' }`; `account_registered` requires a UUID `event_id`; and PostHog outbox payloads require UUID `event_id`, `event_name: 'account_registered'`, and `event_version: 1`.
- Added recursive defense-in-depth sensitive-key rejection for nested input keys, including token, email, database/signed URL, private message, post/comment text, search query, prompt, cookie, and secret variants.
- Tests use UUID event identifiers and prove innocuous unknown keys plus every representative sensitive variant are rejected for audit, business, and outbox inputs before any row persists.
- Verification: focused authority-history suite passes (26 tests); DB typecheck/build, root tests, license check, and diff check pass.
