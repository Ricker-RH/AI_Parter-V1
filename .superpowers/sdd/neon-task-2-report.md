# Neon Database Foundation — Task 2 evidence

## Scope

Implemented the profile/settings authorization boundary solely in the local Docker PostgreSQL 17 service. No hosted Neon connection, hosted credential, product fixture, or product seed data was used. The only persisted configuration row is the required `platform_settings.setting_key = 'global'` default row.

Changed files:

- `packages/db/migrations/202608310001_foundation.sql`
- `packages/db/src/schema.ts`
- `packages/db/src/index.ts`
- `packages/db/tests/foundation-rls.test.ts`

## RED evidence

Before the foundation migration existed, a fresh local volume was started and the baseline migration command completed with no foundation migration. The new focused suite then failed 7/7 foundation tests with the expected cause:

```
error: relation "public.profiles" does not exist
```

This proves the behavioral tests were added before the schema implementation.

## Schema and security implementation

- Creates NOLOGIN `aifans_anon` and `aifans_authenticated`, grants both to the migration owner, and prevents `PUBLIC` schema creation.
- Defines `account_kind` (`human`, `ip`) and `app_locale` (`en`, `zh-CN`), then creates `profiles` and singleton `platform_settings`.
- Enforces UUID IDs, nullable-unique auth subjects, unique usernames, account-kind subject invariants (including a nonblank human subject), username and display-name contracts, bio/avatar length limits, and quota `BETWEEN 0 AND 100`.
- Enables RLS without forcing it. The only policies are `profiles_public_read`, `profiles_owner_update`, and `settings_authenticated_read`.
- Revokes default public table/type/function privileges. The limited roles receive only explicitly listed schema/type/function privileges, safe profile SELECT columns (never `auth_subject`), authenticated-only profile UPDATE columns, authenticated settings SELECT, and authenticated `current_account()` execution.
- `app.current_auth_subject()` defensively handles missing, blank, malformed, non-object, missing-subject, non-string, and blank-subject claims by returning `NULL` without raising.
- `public.current_account()` is a hardened security-definer with empty search path and an explicit six-key JSONB projection. It never serializes the profile row or exposes auth subject, bio, timestamps, or object storage keys.
- A trigger blocks owner edits to `id`, `auth_subject`, `account_kind`, and `created_at`, while using `clock_timestamp()` to maintain `updated_at` on allowed updates.
- `schema.ts` repeats the SQL names, enum types, uniqueness, and check constraints; `index.ts` exports the four requested symbols.

## GREEN and verification evidence

After `docker compose -f infra/postgres/compose.yaml down -v`, the required local startup and migration commands applied `202608310001_foundation.sql` successfully.

The focused suite passed all 14 database tests (7 foundation tests plus 7 existing migration/environment tests). Its foundation assertions cover anonymous profile reads, own/cross-account updates, denied immutable/insert/delete operations, anonymous settings denial, authenticated settings read plus mutation denial, exact current-account projection, all required malformed-claims cases, owner constraint enforcement (including quota zero acceptance), and owner immutable-field/timestamp behavior. Every per-test fixture is transaction-scoped and rolled back.

The full package suite with `DATABASE_URL` also passed 14/14. Additional successful checks:

- `corepack pnpm --dir packages/db typecheck`
- `corepack pnpm --dir packages/db build`
- `corepack pnpm license:check`
- `git diff --check`

Direct PostgreSQL catalog inspection after the clean migration confirmed exactly the three required policies and only the intended profile/settings column grants. In particular, neither limited role has `SELECT` on `profiles.auth_subject`.

## Review notes

The custom JWT-claims GUC remains an API connection-boundary trust mechanism: only server-side code using the restricted role in a transaction may set it. Browser or direct-client credentials must never be granted either NOLOGIN role or a credential that can impersonate them.

## Whitespace-subject regression follow-up

The initial `btrim(...) <> ''` predicate did not reject tab-only or newline-only values. New regression cases first established RED behavior on the previous migration:

- `app.current_auth_subject()` returned a tab character for `{"sub":"\\t"}` rather than `NULL`.
- Inserts of human profiles with a tab-only or newline-only `auth_subject` completed instead of returning PostgreSQL check-constraint code `23514`.

The profile invariant and the matching Drizzle check now use `value ~ '[^[:space:]]'`; defensive claim parsing uses the same POSIX-whitespace-aware predicate for the raw claim text and extracted `sub`.

Fresh-volume GREEN verification commands and results:

```sh
docker compose -f infra/postgres/compose.yaml down -v
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm db:start
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm db:migrate
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test -- foundation-rls.test.ts
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db typecheck
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db build
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm license:check
git diff --check
```

The migration applied `202608310001_foundation.sql`; focused and full database runs each passed 14/14 tests. Typecheck, build, license scan, and diff-check exited successfully.
