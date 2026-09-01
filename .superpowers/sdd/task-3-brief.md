### Task 3: Server-only profile provisioning and scoped sessions

**Files:**
- Create: `packages/db/src/session.ts`
- Create: `packages/db/src/profiles.ts`
- Create: `packages/db/tests/profiles.test.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: verified external auth subject, optional email/name, `DATABASE_USER_URL` for non-owner user-scoped queries, and `DATABASE_ADMIN_URL` for platform provisioning.
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
expect(first.username).toMatch(/^user_[a-f0-9]{25}$/)
expect(first.displayName).toBe('luna')
expect(await getCurrentAccount({subject: first.authSubject})).toMatchObject({id: first.id})
expect(await getCurrentAccount(null)).toBeNull()
```

Add a no-email case that safely falls back to `AIFANS User`. Add tests proving a user-scoped callback rejects blank subjects, cannot update `account_kind` or another user's profile, and leaves no role/claim state behind when the same injected test connection is reused.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
DATABASE_USER_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test DATABASE_ADMIN_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test -- profiles.test.ts
```

Expected: FAIL because the repository functions do not exist.

- [ ] **Step 3: Implement the scoped transaction boundary**

`Actor` is `{subject: string}`. `withActor` rejects blank subjects, opens a transaction, executes `SET LOCAL ROLE aifans_authenticated`, sets a JSON claim containing only the verified `sub`, executes the callback, and commits/rolls back. It never accepts arbitrary claim objects or role names from callers.

Production construction uses `@neondatabase/serverless` Pool with `DATABASE_USER_URL`, whose login role is a member of `aifans_authenticated`, has no owner or `BYPASSRLS` privilege, and is held only by the API. Tests may inject a `pg`-compatible pool and use the local owner only to enter the restricted role. Do not export raw pools or privileged clients from the package root.

Add the name `DATABASE_USER_URL` to `.env.example`. Keep `DATABASE_ADMIN_URL` separate; no runtime fallback from the user URL to the admin/owner URL is allowed.

- [ ] **Step 4: Implement idempotent profile provisioning and lookup**

`ensureHumanProfile` runs only on the admin connection. It first selects by auth subject, then inserts an immutable human row with `ON CONFLICT (auth_subject) DO NOTHING` and re-selects the existing row. A username candidate is `user_` plus 25 lowercase hexadecimal characters from a fresh UUID, which fits `AccountSchema`; retry up to five fresh candidates only when the username unique constraint collides. This avoids assumptions about Neon Auth's external ID format without letting a collision abort signup. Display name priority is non-blank supplied name, non-blank email local-part, then `AIFANS User`.

Normalize returned rows into the existing `AccountSchema` shape. `getCurrentAccount(null)` returns null without opening a database transaction; authenticated calls use `withActor` and `public.current_account()`.

- [ ] **Step 5: Verify the complete database package**

Run:

```bash
DATABASE_USER_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test DATABASE_ADMIN_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db test
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db typecheck
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db build
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm license:check
```

Expected: tests, typecheck, build, and license scan all exit 0.

- [ ] **Step 6: Commit**

```bash
git add .env.example packages/db
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
