# Neon Database Foundation — Task 2 preflight

**Verdict: ISSUES** — resolve the two Important items before implementation.

## Scope and evidence

- Read `task-2-brief.md`, the Neon/Vercel architecture specification, the current
  contracts (`AccountSchema` and `AppSettingsSchema`), the Task 1 report, and the
  current Task 2 worktree state.  The only visible `packages/db` artifact is the
  migration-test baseline; there is no Task 2 migration/schema/test implementation
  to review yet.
- Local command-line PostgreSQL is 14.21, not PostgreSQL 17, so syntax/behavior was
  checked against the PostgreSQL 17 documentation.  PostgreSQL 17 confirms that
  RLS is an additional check to normal privileges, table owners normally bypass
  RLS, policy expressions run with the querying user's privileges, and an UPDATE
  rejected by an RLS `USING` predicate affects zero rows rather than necessarily
  raising an error.  See [RLS documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
- PostgreSQL 17 also confirms the required privilege distinction: table/column
  privileges are independent of RLS, column-level `SELECT`/`UPDATE` grants are
  supported, schema `USAGE` is needed to look up contained objects, and functions
  receive `PUBLIC EXECUTE` by default.  See [Privileges documentation](https://www.postgresql.org/docs/17/ddl-priv.html).

## Important

1. **Do not grant a public `SELECT` of `profiles.auth_subject`.**  The specified
   public-read RLS policy plus a table-level `GRANT SELECT ON public.profiles` makes
   every authenticated identity subject readable to anonymous callers.  RLS filters
   rows, not columns.  Grant `SELECT` only for the safe public columns (and retain
   the named public-read policy), or expose a safe projection view.  If
   `current_account()` needs `auth_subject` while it is security-invoker, that column
   grant would also be required; instead use an explicitly projected,
   narrowly-executable security-definer function *or* another reviewed internal
   path.  A security-definer `current_account()` must be hardened and must never
   return `auth_subject`.

2. **The claims GUC is an application trust boundary, not database authentication.**
   Any principal that can issue arbitrary SQL on the user-scoped connection can run
   `set_config('request.jwt.claims', '{"sub":"someone-else"}', true)` and satisfy
   the proposed policy.  PostgreSQL cannot prove that a custom GUC was set with
   transaction-local scope; `current_setting` only reads its current value.  The API
   must remain the sole holder of the database credential, acquire one connection,
   begin a transaction, `SET LOCAL ROLE aifans_authenticated`, and set a JSON object
   containing only the verified subject before executing user work.  Do not grant
   either role to browser/direct-client credentials.  Add a repository-boundary test
   for rejected blank subjects and a test that role/claim state is absent after the
   transaction/connection is reused.

## Moderate

3. **Parse claims without an uncaught cast error.**  `current_setting('request.jwt.claims', true)::jsonb`
   throws for malformed JSON; missing/previously-reset custom settings may also be
   `NULL` or an empty string.  Implement a defensive function which reads with
   `missing_ok = true`, normalizes empty to `NULL`, catches invalid JSON, accepts
   only a JSON object whose `sub` is a non-blank JSON string, and returns `NULL`
   otherwise.  `null`, arrays, numbers, booleans, `{}`, and blank/whitespace `sub`
   must all return `NULL`.  `current_account()` must return `NULL` for each case.
   The required null-claims test alone does not prove this.

4. **Current-account JSON needs an explicit, non-secret database shape.**  A raw
   `to_jsonb(profiles)` result leaks `auth_subject` and is snake_case
   (`account_kind`, `display_name`, `preferred_locale`, `creator_mode_enabled`), not
   the camel-case `AccountSchema` (`kind`, `displayName`, etc.).  This is workable
   only if the SQL function explicitly projects safe database fields and Task 3
   explicitly maps/validates them before returning the contract.  `avatar_object_key`
   is an R2 key, whereas `AccountSchema.avatarUrl` must be a URL; do not cast or
   expose an object key as `avatarUrl`.  Document the JSON keys and add an exact-key
   test (including exclusion of `auth_subject`, timestamps unless intentionally
   exposed, and `bio` unless intentionally part of the return).

5. **Add a table-owner trigger test; the prescribed account-kind test only proves a
   grant.**  With an `UPDATE (allowed_columns)` grant, changing `account_kind` as
   `aifans_authenticated` correctly fails with `permission denied` before the
   trigger/RLS policy is the decisive protection.  Because the owner intentionally
   bypasses RLS (no `FORCE ROW LEVEL SECURITY`), test an owner update of each
   immutable field (`id`, `auth_subject`, `account_kind`, `created_at`) and assert
   the trigger rejection.  The trigger must compare with `IS DISTINCT FROM`, then
   set `NEW.updated_at` itself.  Separately test an allowed owner update changes
   `updated_at` and an authenticated update of another profile affects zero rows.

6. **Resolve the settings constraint mismatch.**  Task 2 requires a strictly
   positive `default_ip_quota` and a matching Drizzle `CHECK (> 0)`, while the
   existing `AppSettingsSchema` accepts `0` (`z.int().min(0).max(100)`).  Either
   change the contract to `.min(1)` in its own reviewed task or deliberately make
   the database-to-contract adapter reject zero; the current two authoritative
   surfaces disagree.  Also use `NOT NULL`, `CHECK (setting_key = 'global')`, a
   primary/unique key, and `CHECK (default_ip_quota > 0)`.  The migration insert
   proves an initial row and the key proves at most one; an owner can still delete
   it, which is consistent only if the explicitly privileged platform path owns
   ongoing configuration management.

## Required implementation/test details

- PostgreSQL 17-compatible role setup is a `DO` existence block plus `CREATE ROLE
  ... NOLOGIN` (not unsupported `CREATE ROLE IF NOT EXISTS`), followed by `GRANT
  aifans_anon, aifans_authenticated TO CURRENT_USER`.  `SET LOCAL ROLE` is valid
  for a member role and must be executed inside the same database transaction and
  physical connection as `set_config(..., true)` and the assertion.
- Revoke `CREATE` from `PUBLIC` on both `public` and `app` as intended, and grant
  only necessary schema `USAGE`/function `EXECUTE`.  Revoke `PUBLIC EXECUTE` before
  granting any security-definer function to its exact caller roles; PostgreSQL grants
  function execute to `PUBLIC` by default.  Keep every security-definer body fully
  qualified with `SET search_path = ''`; do **not** make a broad table-reading
  `current_account()` definer function.
- Enable RLS on both tables and create exactly the named policies.  Do not force it:
  the owner/bypass behavior is intentional for the platform path, but the owner
  connection must never be used for user-scoped work.  `profiles_owner_update` needs
  both `USING` and `WITH CHECK` based on `auth_subject = app.current_auth_subject()`.
- Use the account-kind/auth-subject invariant exactly:
  `(account_kind = 'human' AND auth_subject IS NOT NULL) OR
   (account_kind = 'ip' AND auth_subject IS NULL)`; additionally reject blank
  human subjects.  Keep nullable `UNIQUE (auth_subject)`, `UNIQUE (username)`,
  `username ~ '^[a-z0-9_]{3,30}$'`, a real non-whitespace display-name check (for
  example `display_name ~ '[^[:space:]]'` plus the 1--80 length bound), and the bio/
  object-key limits.
- The requested behavioral suite is otherwise directionally correct: it proves
  public profile visibility, column-grant denial for account-kind/insert/delete,
  RLS filtering of a cross-user update (`0` rows), settings privilege denial, and
  a matched caller row.  Expand it to prove malformed claims, no `auth_subject`
  exposure, exact current-account JSON shape, owner-only immutability trigger
  enforcement, `updated_at` handling, both account-kind/auth-subject directions,
  quota `0` rejection, and the exact allowed-update column set.  Run constraint
  inserts as the owner so a privilege denial cannot masquerade as a constraint test.

## Contract alignment summary

- Aligned: UUID id, `human|ip`, `en|zh-CN`, username length/character rule, display
  name upper bound, and creator-mode boolean.
- Deliberately stricter database rule: display name must contain non-whitespace.
- Must resolve/document: positive quota versus `AppSettingsSchema.min(0)`, snake_case
  SQL JSON versus camel-case API contract, and object key versus avatar URL.

