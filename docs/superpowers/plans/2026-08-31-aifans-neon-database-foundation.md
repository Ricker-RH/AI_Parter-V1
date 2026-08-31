# AIFANS Neon Database Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unimplemented Supabase database task with a portable Neon PostgreSQL foundation that has real Docker integration tests, typed Drizzle schema, profile provisioning, and behavioral row-level authorization.

**Architecture:** Keep schema and authorization in portable PostgreSQL. The API supplies a verified auth subject through transaction-local claims while a non-owner role remains subject to RLS; platform provisioning uses a separate privileged path. Drizzle provides typed queries, while a small checksum-validating runner applies reviewed SQL migrations locally and to isolated Neon branches.

**Tech Stack:** Node.js 24.19.0, pnpm 11.21.0, TypeScript 7.0.2, PostgreSQL 17, Docker Compose, Drizzle ORM 0.45.2, Neon Serverless Driver 1.1.0, pg 8.23.0, Vitest 4.1.11, Zod 4.5.4.

## Global Constraints

- Humans cannot publish top-level posts or change their account kind to `ip`.
- Browser code never receives a database connection string or calls product tables directly.
- User-scoped queries run as a non-owner role with transaction-local verified claims and remain subject to RLS.
- Platform-only mutations use a separate privileged path and will be audited when the audit subsystem is introduced.
- Development, test, staging, and production contain no seeded mock product data.
- Tests may create ephemeral fixtures only in an isolated test database and must roll them back or delete them.
- Hosted Neon credentials are not required for local Tasks 1–3.
- Every dependency is pinned exactly and every behavior change follows RED → GREEN TDD.

---

## File map

```text
infra/postgres/compose.yaml                 Local PostgreSQL 17 service only
packages/db/package.json                   Database package scripts and exact dependencies
packages/db/tsconfig.json                  NodeNext TypeScript build
packages/db/src/env.ts                     Server-only database environment validation
packages/db/src/migrate.ts                 Checksum-validating SQL migration runner
packages/db/src/schema.ts                  Drizzle table/enum definitions
packages/db/src/session.ts                 User-scoped transaction claim boundary
packages/db/src/profiles.ts                Profile provisioning/current-account repository
packages/db/src/index.ts                   Public server-only exports
packages/db/migrations/*.sql               Reviewed PostgreSQL migrations
packages/db/tests/*.test.ts                Unit and real Docker integration tests
```

### Task 1: Reproducible local PostgreSQL and migration runner

**Files:**
- Create: `infra/postgres/compose.yaml`
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/src/env.ts`
- Create: `packages/db/src/migrate.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/tests/migrate.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `DATABASE_URL` and optional `DATABASE_ADMIN_URL`.
- Produces: `readDatabaseEnv(env)`, `migrate(options)`, and root scripts `db:start`, `db:stop`, `db:migrate`, `db:test`.

- [ ] **Step 1: Write the failing environment and migration-discovery tests**

```ts
// packages/db/tests/migrate.test.ts
import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {discoverMigrations} from '../src/migrate.js'
import {readDatabaseEnv} from '../src/env.js'

describe('database environment', () => {
  it('requires a postgres URL and falls back to it for administration', () => {
    const result = readDatabaseEnv({DATABASE_URL: 'postgresql://app@localhost/aifans'})
    expect(result).toEqual({
      databaseUrl: 'postgresql://app@localhost/aifans',
      adminUrl: 'postgresql://app@localhost/aifans',
    })
  })

  it('rejects non-postgres URLs', () => {
    expect(() => readDatabaseEnv({DATABASE_URL: 'https://example.com'})).toThrow(
      'DATABASE_URL',
    )
  })
})

describe('migration discovery', () => {
  it('sorts SQL files and includes a stable SHA-256 checksum', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aifans-migrations-'))
    writeFileSync(join(directory, '002_second.sql'), 'select 2;\n')
    writeFileSync(join(directory, '001_first.sql'), 'select 1;\n')

    const migrations = discoverMigrations(directory)
    expect(migrations.map(({name}) => name)).toEqual(['001_first.sql', '002_second.sql'])
    expect(migrations[0]?.checksum).toMatch(/^[a-f0-9]{64}$/)
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test -- migrate.test.ts
```

Expected: FAIL because `packages/db` and its source modules do not exist.

- [ ] **Step 3: Add the package, exact dependencies, local container, and root commands**

```json
// packages/db/package.json
{
  "name": "@aifans/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {".": "./dist/index.js"},
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "migrate": "tsx src/migrate.ts"
  },
  "dependencies": {
    "@aifans/contracts": "workspace:*",
    "@neondatabase/serverless": "1.1.0",
    "drizzle-orm": "0.45.2",
    "pg": "8.23.0",
    "zod": "4.5.4"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/pg": "8.23.1",
    "tsx": "4.23.13",
    "typescript": "7.0.2",
    "vitest": "4.1.11"
  }
}
```

```yaml
# infra/postgres/compose.yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: aifans_test
      POSTGRES_USER: aifans_owner
      POSTGRES_PASSWORD: local_only_aifans
    ports:
      - "127.0.0.1:55432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aifans_owner -d aifans_test"]
      interval: 2s
      timeout: 3s
      retries: 30
    volumes:
      - aifans-postgres-data:/var/lib/postgresql/data

volumes:
  aifans-postgres-data:
```

Add these root scripts without replacing existing scripts:

```json
{
  "db:start": "docker compose -f infra/postgres/compose.yaml up -d --wait",
  "db:stop": "docker compose -f infra/postgres/compose.yaml down",
  "db:migrate": "pnpm --dir packages/db migrate",
  "db:test": "pnpm db:start && DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test pnpm db:migrate && DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test pnpm --dir packages/db test"
}
```

Set `.env.example` to names only and include `DATABASE_URL`, `DATABASE_ADMIN_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Ignore only local `.env` files and build/runtime output; do not ignore migrations.

- [ ] **Step 4: Implement validation and a checksum-safe runner**

`readDatabaseEnv` accepts an environment record, validates `postgres:`/`postgresql:` URLs with Zod, and never includes credentials in error messages. `discoverMigrations(directory)` returns sorted `{name, sql, checksum}` objects for files matching `/^\d{12}_[a-z0-9_]+\.sql$/`.

`migrate({connectionString, directory})` must:

1. connect with `pg.Pool`;
2. acquire advisory lock `947361204`;
3. create `app_migrations.schema_migrations(name text primary key, checksum text not null, applied_at timestamptz not null default now())`;
4. reject an already-applied filename whose checksum changed;
5. apply each new file and record it in the same transaction;
6. always release the client and close the pool.

The executable path reads `DATABASE_ADMIN_URL ?? DATABASE_URL`, resolves `../migrations` from the module location, prints migration names only, and exits non-zero with a redacted error. Export only server-side functions from `src/index.ts` using NodeNext `.js` specifiers.

- [ ] **Step 5: Install and verify GREEN**

Run:

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm install
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test -- migrate.test.ts
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db typecheck
```

Expected: tests PASS, typecheck exits 0, and the lockfile contains the exact database package versions.

- [ ] **Step 6: Commit**

```bash
git add .env.example .gitignore package.json pnpm-lock.yaml infra/postgres packages/db
git commit -m "build: add Neon database workspace"
```

### Task 2: Profiles, settings, and behavioral RLS

**Files:**
- Create: `packages/db/migrations/202608310001_foundation.sql`
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/tests/foundation-rls.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: PostgreSQL owner connection for migration/test setup and transaction-local JSON claim `{"sub":"<auth subject>"}`.
- Produces: `profiles`, `platform_settings`, `app.current_auth_subject()`, `public.current_account()`, and Drizzle exports `profiles`, `platformSettings`, `accountKindEnum`, `appLocaleEnum`.

- [ ] **Step 1: Write behavioral integration tests before the migration**

Use two real human fixtures with random UUID profile IDs and auth subjects. Each test starts a transaction as the owner, creates only its required fixtures, switches with `SET LOCAL ROLE aifans_authenticated` or `aifans_anon`, sets claims with `select set_config('request.jwt.claims', $1, true)`, asserts behavior, resets role when cleanup is required, and rolls back.

The test file must contain separate assertions proving:

```ts
expect(await readPublicProfileAsAnon(owner, firstId)).toMatchObject({id: firstId})
await expect(updateOwnDisplayName(owner, firstSubject, 'New name')).resolves.toBe(1)
await expect(updateOtherDisplayName(owner, firstSubject, secondId)).resolves.toBe(0)
await expect(changeOwnAccountKind(owner, firstSubject)).rejects.toThrow(/permission denied/)
await expect(insertProfileAsAuthenticated(owner, firstSubject)).rejects.toThrow(/permission denied/)
await expect(deleteOwnProfile(owner, firstSubject)).rejects.toThrow(/permission denied/)
await expect(readSettingsAsAnon(owner)).rejects.toThrow(/permission denied/)
await expect(readSettingsAsAuthenticated(owner, firstSubject)).resolves.toMatchObject({defaultIpQuota: 3})
await expect(readCurrentAccount(owner, firstSubject)).resolves.toMatchObject({id: firstId})
await expect(readCurrentAccount(owner, null)).resolves.toBeNull()
```

Also assert that uppercase/invalid usernames, blank display names, human rows without `auth_subject`, IP rows with `auth_subject`, and a second `global` settings row are rejected by database constraints.

- [ ] **Step 2: Start Docker, run migrations/tests, and verify RED**

Run:

```bash
docker compose -f infra/postgres/compose.yaml down -v
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm db:start
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm db:migrate
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test -- foundation-rls.test.ts
```

Expected: FAIL because the foundation migration and tables do not exist.

- [ ] **Step 3: Implement the reviewed foundation SQL migration**

The migration must create:

- NOLOGIN roles `aifans_anon` and `aifans_authenticated` when absent;
- enum `public.account_kind` with `human`, `ip`;
- enum `public.app_locale` with `en`, `zh-CN`;
- schema `app` with no public create privilege;
- `public.profiles` with UUID primary key, nullable unique `auth_subject`, immutable `account_kind`, username constrained by `^[a-z0-9_]{3,48}$`, display name constrained to 1–80 non-whitespace characters, bio limited to 500 characters, avatar object key limited to 512 characters, locale, creator-mode flag, and timestamps;
- `public.platform_settings` restricted to the literal key `global`, default approval flag `false`, and positive default IP quota `3`;
- exactly one required `global` configuration row;
- `app.current_auth_subject()` reading only transaction-local `request.jwt.claims.sub` and returning null for missing/invalid claims;
- a zero-argument `public.current_account()` returning the caller profile as JSONB;
- a hardened trigger that manages `updated_at` while rejecting owner attempts to change immutable fields.

Use explicit revokes/grants. `aifans_anon` receives only profile `SELECT`. `aifans_authenticated` receives profile `SELECT`, settings `SELECT`, and `UPDATE` only on `username`, `display_name`, `bio`, `avatar_object_key`, `preferred_locale`, and `creator_mode_enabled`. Neither role receives profile insert/delete, settings mutation, or schema-create rights.

Grant both NOLOGIN roles to the migration's `CURRENT_USER` so the server-side owner connection can enter a restricted role with `SET LOCAL ROLE`. Enable RLS on both tables; do not force RLS because the table owner is the explicitly privileged platform path. Policies must be exactly:

- `profiles_public_read` for anon/authenticated select;
- `profiles_owner_update` for authenticated update using and checking `auth_subject = app.current_auth_subject()`;
- `settings_authenticated_read` for authenticated select.

All security-definer functions use `SET search_path = ''`, fully qualified objects, and revoked public execution. The platform owner keeps the rights needed for provisioning and operations.

- [ ] **Step 4: Define a matching typed Drizzle schema**

`src/schema.ts` defines the exact database column names/types and exports the four symbols named in this task's Interfaces. It must repeat the SQL username, display-name, auth-subject/account-kind, settings-key, and positive-quota constraints with Drizzle `check(...)` declarations, plus the unique auth-subject and username constraints. SQL remains authoritative for grants, functions, triggers, and policies.

- [ ] **Step 5: Reset and verify GREEN**

Run the Task 2 Step 2 commands again from a fresh `docker compose down -v`, followed by:

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db typecheck
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db build
```

Expected: every behavioral authorization/constraint test PASS, typecheck/build exit 0, and there is no product seed data other than the required `global` settings row.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat: add Neon profile authorization foundation"
```

### Task 3: Server-only profile provisioning and scoped sessions

**Files:**
- Create: `packages/db/src/session.ts`
- Create: `packages/db/src/profiles.ts`
- Create: `packages/db/tests/profiles.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: verified external auth subject, optional email/name, `DATABASE_URL` for user-scoped queries, and `DATABASE_ADMIN_URL` for platform provisioning.
- Produces: `withActor(actor, callback)`, `ensureHumanProfile(input)`, `getCurrentAccount(actor)`, `Actor`, and `CurrentAccount`.

- [ ] **Step 1: Write failing real-database repository tests**

```ts
const first = await ensureHumanProfile({
  authSubject: `auth_${crypto.randomUUID()}`,
  email: 'luna@example.com',
  displayName: null,
})
const second = await ensureHumanProfile({
  authSubject: first.authSubject,
  email: 'changed@example.com',
  displayName: 'Changed',
})

expect(second.id).toBe(first.id)
expect(first.accountKind).toBe('human')
expect(first.username).toMatch(/^user_[a-f0-9]{32}$/)
expect(first.displayName).toBe('luna')
expect(await getCurrentAccount({subject: first.authSubject})).toMatchObject({id: first.id})
expect(await getCurrentAccount(null)).toBeNull()
```

Add a no-email case that safely falls back to `AIFANS User`. Add a test proving a user-scoped callback cannot update `account_kind` or another user's profile.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test DATABASE_ADMIN_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test -- profiles.test.ts
```

Expected: FAIL because the repository functions do not exist.

- [ ] **Step 3: Implement the scoped transaction boundary**

`Actor` is `{subject: string}`. `withActor` rejects blank subjects, opens a transaction, executes `SET LOCAL ROLE aifans_authenticated`, sets a JSON claim containing only the verified `sub`, executes the callback, and commits/rolls back. It never accepts arbitrary claim objects or role names from callers.

Production construction uses `@neondatabase/serverless` Pool with `DATABASE_URL`; tests may inject a `pg`-compatible pool. Do not export raw pools or privileged clients from the package root.

- [ ] **Step 4: Implement idempotent profile provisioning and lookup**

`ensureHumanProfile` runs only on the admin connection. It inserts an immutable human row and uses `ON CONFLICT (auth_subject) DO NOTHING`, then selects the existing row. The generated username is `user_` plus the first 32 lowercase hexadecimal characters of `sha256(authSubject)`, avoiding assumptions about Neon Auth's external ID format. Display name priority is non-blank supplied name, non-blank email local-part, then `AIFANS User`.

Normalize returned rows into the existing `AccountSchema` shape. `getCurrentAccount(null)` returns null without opening a database transaction; authenticated calls use `withActor` and `public.current_account()`.

- [ ] **Step 5: Verify the complete database package**

Run:

```bash
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test DATABASE_ADMIN_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db typecheck
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db build
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm license:check
```

Expected: tests, typecheck, build, and license scan all exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat: add authenticated profile repository"
```

## Completion gate

Before Task 5 API work starts:

1. run the database package tests from a freshly recreated Docker volume;
2. run root `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm license:check` under the pinned runtime;
3. obtain an independent spec-compliance and security review;
4. fix every Critical or Important finding and re-run the reviewer;
5. update the foundation plan so Tasks 5, 8, and 9 consume Neon adapters rather than Supabase.

Hosted Neon/Vercel/R2 configuration is intentionally deferred until the local foundation passes this gate.
