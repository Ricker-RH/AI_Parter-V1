### Task 4: Supabase profiles, settings, and RLS

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202608310001_foundation.sql`
- Create: `supabase/tests/001_foundation_rls.sql`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Supabase Auth user UUIDs.
- Produces: `public.profiles`, `public.platform_settings`, `public.current_account()`, and tested row-level policies.

- [ ] **Step 1: Install the pinned local CLI and write failing pgTAP authorization tests**

Add exact root dev dependency `supabase@2.116.0`. Configure `supabase/config.toml` for the local project and explicitly set `db.seed.enabled = false` so database resets cannot add demo data.

```sql
-- supabase/tests/001_foundation_rls.sql
begin;
select no_plan();

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'platform_settings', 'settings exists');
select policies_are('public', 'profiles', array['profiles_public_read', 'profiles_owner_update']);
select policies_are('public', 'platform_settings', array['settings_authenticated_read']);
select function_returns('public', 'current_account', array[]::text[], 'jsonb');

-- Create two isolated auth users, then switch request.jwt.claims/role to assert:
-- anon and authenticated users can read public profiles;
-- owners can update only editable profile columns;
-- cross-user updates and all client profile inserts/deletes are denied;
-- account_kind, id, created_at, and server-managed updated_at are immutable;
-- anonymous settings reads are denied and authenticated reads succeed;
-- current_account() returns only the caller's profile and is null for anon.

select * from finish();
rollback;
```

- [ ] **Step 2: Run the database test and verify failure**

Run: `pnpm supabase:start && pnpm supabase:test`  
Expected: FAIL because the migration and tables do not exist.

- [ ] **Step 3: Implement the minimal real-data schema**

Create enums `account_kind ('human','ip')` and `app_locale ('en','zh-CN')`. Create `profiles` keyed to `auth.users(id)` with a non-empty, length-bounded, format-checked, unique lowercase username; display name; nullable bio/avatar path; locale; creator-mode flag; timestamps; and no posting-capability column. Create `platform_settings` with one row keyed `global`, containing `creator_ip_requires_approval false` and `default_ip_quota 3`.

Enable RLS and use explicit grants/revokes. Allow public profile reads, owner-only updates to `username`, `display_name`, `bio`, `avatar_path`, `locale`, and `creator_mode_enabled`, and authenticated settings reads. Owners must not be able to change `id`, `account_kind`, `created_at`, or server-managed `updated_at`; add database enforcement in addition to policy checks. Do not grant client profile insert/delete or settings mutation rights.

Add a narrowly scoped `SECURITY DEFINER` `auth.users` trigger function with `SET search_path = ''`, fully qualified objects/functions, and no unnecessary direct execution grant. It creates exactly one human profile using the full UUID normalized without hyphens for a collision-safe `user_<uuid>` username and uses a safe display-name fallback when email is null or empty. This is real account initialization, not seed content. Add a zero-argument, security-invoker `current_account()` returning only the authenticated profile as JSONB.

Add root scripts:

```json
{
  "supabase:start": "supabase start",
  "supabase:stop": "supabase stop",
  "supabase:reset": "supabase db reset",
  "supabase:test": "supabase test db"
}
```

- [ ] **Step 4: Verify migrations and RLS**

Run: `pnpm supabase:reset && pnpm supabase:test`  
Expected: migration succeeds and every structural and behavioral pgTAP assertion PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml supabase
git commit -m "feat: add authenticated profile foundation"
```
