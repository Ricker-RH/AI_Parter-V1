# Neon database foundation — Task 1 evidence

## Runtime

- Node: `v24.19.0`
- pnpm: `11.21.0`
- Runtime prefix: `PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"`

## RED

Before package or source implementation, `packages/db/tests/migrate.test.ts` was created and the required focused command was run:

```text
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test -- migrate.test.ts

[ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND] No package.json (or package.yaml, or package.json5) was found in ".../packages/db".
```

This failed for the expected reason: the database package and source modules did not exist.

## GREEN

The database workspace, local PostgreSQL compose harness, environment validation, migration discovery, and checksum-safe runner were then implemented. The exact required commands passed:

```text
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm install
Already up to date
Done in 245ms using pnpm v11.21.0

PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test -- migrate.test.ts
Test Files  1 passed (1)
Tests  4 passed (4)

PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db typecheck
tsc -p tsconfig.json --noEmit
```

`git diff --check` also completed with no output.

## Verification constraint

`tsx@4.23.13` introduces `esbuild@0.28.2`. pnpm 11.21 requires an explicit build-policy decision for it and, when invoked without configuration, exits with:

```text
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.2
```

The workspace now contains the narrow explicit approval:

```yaml
allowBuilds:
  esbuild: true
```

The exact required install, focused test, and typecheck commands now run without an environment override.

## Requirement inconsistency

The supplied focused test fixtures were updated to twelve-digit prefixes. A regression test first failed because the prior implementation accepted `001_legacy.sql`; discovery now matches only `/^\d{12}_[a-z0-9_]+\.sql$/`.

## Commits

- `3b7e3e4 build: add Neon database workspace` — Task 1 foundation.
- `30abb0a docs: design history and product analytics` — contains the Task 1 strict filename and build-policy corrections, plus an unrelated concurrent analytics specification.

## Review-fix evidence

The missing-directory regression was written before the runner change and failed as expected:

```text
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test -- migrate.test.ts
Error: ENOENT: no such file or directory, scandir '.../aifans-missing-migrations-...'
```

The runner now returns `[]` only for `ENOENT`; a separate unit test confirms other filesystem errors propagate. `@types/node` is pinned only in `packages/db` to `24.13.3` and the corresponding importer entry is updated in the lockfile.

The Docker-backed integration test covers initial application, schema-migrations idempotency, checksum mutation rejection, failed-SQL rollback with no migration record, and a subsequent successful migration that proves the connection and advisory lock are released. Its explicit local command was attempted:

```text
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test -- migrate.integration.test.ts
Error: connect ECONNREFUSED 127.0.0.1:55432
```

The prerequisite `pnpm db:start` could not pull `postgres:17-alpine` because Docker Hub returned `unauthorized: incorrect username or password`; no local postgres image was available. This blocks only live execution of the integration test.

Final non-Docker verification passed:

```text
corepack pnpm install
Already up to date (pnpm v11.21.0)

corepack pnpm --dir packages/db test -- migrate.test.ts
Test Files  1 passed | 1 skipped (2)
Tests  6 passed | 1 skipped (7)

corepack pnpm --dir packages/db typecheck
tsc -p tsconfig.json --noEmit

git diff --check
(no output)
```

## Docker integration resolution

The official `postgres:17-alpine` image was subsequently made available under the expected local tag without changing the compose file. The required live commands then passed:

```text
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm db:start
Container postgres-postgres-1 Healthy

DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test -- migrate.integration.test.ts
Test Files  2 passed (2)
Tests  7 passed (7)

PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test -- migrate.test.ts
Test Files  1 passed | 1 skipped (2)
Tests  6 passed | 1 skipped (7)

PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db typecheck
tsc -p tsconfig.json --noEmit

git diff --check
(no output)
```
