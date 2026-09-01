# Task 4 preflight: Supabase profiles, settings, and RLS

**Verdict: ISSUES**

Read-only audit performed against the Task 4 brief, approved V1 design, the current worktree, and local help/templates from the pinned `supabase@2.116.0` package. No product implementation files were changed.

## Compatibility findings

- The pinned CLI resolves and reports `2.116.0`. Its local help confirms `supabase start`, `supabase db reset`, and `supabase test db`; `test db` runs pgTAP against the local database by default. The planned script command names are valid.
- The proposed pgTAP calls are compatible with the expected API: `has_table(schema, table, description)`, `policies_are(schema, table, text[], description)`, and `function_returns(schema, function, text[], return_type, description)`. The explicit `array[]::text[]` correctly represents a zero-argument function.
- The CLI-generated pgTAP template uses `BEGIN`, `plan(...)`, `finish()`, and `ROLLBACK` in the same form as the brief. Actual execution could not be validated on this host because no supported container runtime is installed.
- The CLI-generated `config.toml` defaults to PostgreSQL 17 and enables `db.seed` with `./seed.sql`. Task 4 should explicitly disable seeding (or make reset use `--no-seed`) so the no-fake-data invariant is configuration-enforced rather than dependent on an absent file.

## Severity-ranked issues

### High — owner update can become an account-kind privilege escalation

`profiles_owner_update` must not grant an authenticated owner unrestricted updates to the full row. `account_kind` distinguishes humans from AI/IP actors, and the approved design explicitly forbids humans switching into an AI/IP identity. A conventional owner policy (`USING/WITH CHECK (auth.uid() = id)`) still allows the owner to set `account_kind = 'ip'`, and also permits rewriting audit timestamps. Restrict authenticated `UPDATE` privileges to the intended editable columns (username, display name, bio, avatar path, locale, and creator-mode flag), or add equivalent database enforcement. Keep `id`, `account_kind`, `created_at`, and server-managed `updated_at` immutable to the owner.

### High — the five tests do not test authorization behavior

`policies_are` proves only that named policies exist. It does not prove anon/public reads, owner-only updates, cross-user denial, settings denial for anon, settings read for authenticated users, blocked profile insert/delete, immutable `account_kind`, or `current_account()` scoping. The task claims "tested row-level policies", so behavioral pgTAP cases under simulated `anon`/`authenticated` JWT claims are required. Keep the five structural assertions if desired, but do not treat them as sufficient RLS verification.

### Medium — the pinned CLI is not yet reproducible through the planned scripts

The host has no global `supabase` binary and the root package has no `supabase` dev dependency. Merely adding scripts whose bodies call bare `supabase` will fail here. Add exact dev dependency `supabase: 2.116.0` (not a range) so pnpm places the binary on the script PATH and the tech-stack pin is represented in the lockfile.

### Medium — a UUID *prefix* is not collision-safe by itself

`user_<uuid prefix>` can collide; an 8-hex-character prefix has only 32 bits, and a unique violation inside the `auth.users` trigger would abort signup. Use the full UUID (for example, normalized without hyphens) or deterministic retry/fallback that expands the suffix on conflict. Add a collision-path test. The display-name derivation should also fall back safely when `email` or its local part is null/empty.

### Medium — the auth trigger needs explicit privilege and search-path hardening

The `auth.users` trigger should call a narrowly scoped `SECURITY DEFINER` function owned by a trusted migration role, use `SET search_path = ''`, fully qualify every referenced object/type/function, and grant no unnecessary direct execution. Otherwise signup may fail because the Auth role cannot insert through profile RLS, or the definer function may be exposed to search-path substitution. Keep the trigger operation deterministic and limited to inserting the new user's one profile.

### Medium — local verification is blocked by host prerequisites

No `docker`, Podman, Colima, Finch, OrbStack, or Rancher Desktop runtime was found. Therefore `supabase start`, `db reset`, and `test db` cannot run on this host today. The shell also reports Node `22.14.0` and pnpm `11.19.0`, while the repository requires Node `24.19.0` and pnpm `11.21.0` with `engine-strict=true`; align these before installing the new dependency.

## SQL/RLS expectations for implementation

- Enforce lowercase usernames in the database (`CHECK (username = lower(username))`) in addition to uniqueness; normalize before insert/update and choose a deliberate non-empty/format/length constraint.
- Use explicit `TO anon, authenticated` (or the intended public roles) for public profile reads, `TO authenticated` for owner updates/settings reads, and both `USING` and `WITH CHECK` for owner updates. Do not add client insert/delete policies for profiles or mutation policies for platform settings.
- Prefer explicit grants/revokes even though CLI 2.116.0's fresh-project config can auto-expose new public objects. RLS is not a substitute for object/column privileges.
- Implement `current_account()` as a zero-argument `jsonb` function filtered by `auth.uid()`; do not let caller input select another account. Prefer security-invoker unless a definer is demonstrably needed; if definer is used, harden the search path and scope exactly as above.
- The one `platform_settings('global', false, 3)` row is required configuration, not demo content, and is consistent with the approved empty-data policy.

## Credential decision

**No user-supplied Supabase cloud credentials are needed for Task 4.** `supabase start`, local reset, and local pgTAP tests do not require `supabase login`, a project ref, an access token, or hosted database secrets. A supported local container runtime, network access for initial image download, and the repository-pinned Node/pnpm versions are required. Do not use `--linked` or a remote `--db-url` for this task.
