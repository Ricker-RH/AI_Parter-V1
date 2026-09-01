# Neon Database Foundation — Task 3 Evidence

## Scope

- Added server-only authenticated profile provisioning and current-account lookup.
- Added transaction-local actor scoping with a fixed `aifans_authenticated` role and a JSON claim containing only the verified `sub`.
- Added `DATABASE_USER_URL` to `.env.example`; the scoped-session runtime requires that variable and never falls back to `DATABASE_ADMIN_URL` or `DATABASE_URL`.
- Kept raw pool handles out of `@aifans/db` root exports. The test-only pg-compatible pool injection helpers are module-local exports from `session.ts` and `profiles.ts`.

## TDD evidence

### RED

Command:

```bash
DATABASE_USER_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test DATABASE_ADMIN_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test -- profiles.test.ts
```

Result: failed as expected before implementation with `Cannot find module '../src/profiles.js'` from `packages/db/tests/profiles.test.ts`; the focused test file had zero executed tests because the module did not exist.

### GREEN

The same focused command passed after implementation: 2 test files passed, 11 tests passed, 8 unrelated RLS integration tests skipped because the specified command intentionally does not set `DATABASE_URL`.

`packages/db/tests/profiles.test.ts` covers:

- idempotent human provisioning and current-account lookup;
- safe no-email display-name fallback;
- rejecting blank actor subjects;
- RLS prevention of immutable-field and cross-user updates;
- transaction-local role and claims cleanup when a max-one injected connection is reused.

## Fresh local Docker database verification

The scoped `postgres` compose volume was recreated with `docker compose -f infra/postgres/compose.yaml down -v` then `up -d --wait`. The foundation migration was applied using only the local `127.0.0.1:55432/aifans_test` PostgreSQL service.

Command environment set all three local URLs: `DATABASE_URL`, `DATABASE_ADMIN_URL`, and `DATABASE_USER_URL`.

Results:

- `pnpm --dir packages/db migrate`: applied `202608310001_foundation.sql`.
- `pnpm --dir packages/db test`: 4 test files passed, 19 tests passed.
- `pnpm --dir packages/db typecheck`: passed.
- `pnpm --dir packages/db build`: passed.

## Root verification

- `pnpm typecheck`: passed (3/3 packages).
- `pnpm build`: passed (3/3 packages).
- `pnpm license:check`: passed.
- `git diff --check`: passed.

`pnpm test` was run and remains blocked by pre-existing UI harness issues outside Task 3:

1. `packages/ui/src/styles/tokens.test.tsx` resolves `src/styles/tokens.css` from the repository root when the root Vitest project runs, producing `ENOENT`.
2. `packages/ui/src/components/Logo.test.tsx` calls React Testing Library under a Node environment and fails with `document is not defined`.

The Task 3 database tests pass in both the focused and complete local-database runs; no Task 3 files were changed to mask the unrelated UI failures.

## Boundary review

- `withActor` validates nonblank subjects, runs `BEGIN`, `SET LOCAL ROLE aifans_authenticated`, and `set_config(..., true)` with exactly `{"sub": actor.subject}`, then commits or rolls back before releasing the connection.
- `ensureHumanProfile` only uses the separately constructed admin pool; it first reads by subject, inserts a `human` row with `ON CONFLICT (auth_subject) DO NOTHING`, re-reads a concurrent winner, and retries only PostgreSQL constraint `profiles_username_unique` up to five fresh UUID-derived username candidates.
- Account results are passed through `AccountSchema`; `avatarUrl` is intentionally omitted until an R2 URL adapter exists.
- No hosted Neon endpoint or external credential was used.
