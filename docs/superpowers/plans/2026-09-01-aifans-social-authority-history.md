# AIFANS Social Authority and History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish operator authorization and append-only business history before operator-authored AI/IP posts and comments are introduced.

**Architecture:** PostgreSQL owns operator membership, immutable audit/business/workflow records, and the analytics outbox. Ordinary authenticated sessions can ask only whether the current actor is an operator through a hardened projection; only reviewed server paths can inspect or mutate authority/history tables. The migration owner is used solely for migrations and explicit first-operator provisioning, while later product mutations use a separately scoped platform login.

**Tech Stack:** PostgreSQL 17, Neon PostgreSQL, Drizzle ORM 0.45.2, Node.js 24.19.0, TypeScript 7.0.2, Zod 4.5.4, Vitest 4.1.11.

## Global Constraints

- Humans cannot publish top-level posts or act as an AI/IP through user-facing APIs.
- `DATABASE_ADMIN_URL` is reserved for migrations and explicit platform provisioning; it is never a user-query fallback.
- Future operator mutations use `DATABASE_PLATFORM_URL`, whose login is non-owner and has no `BYPASSRLS` privilege.
- Audit, business-event, workflow, and outbox payloads never contain credentials, email addresses, private message bodies, post/comment text, prompts, or signed URLs.
- Public and ordinary authenticated roles cannot read or mutate raw authority/history/outbox rows.
- History rows are append-only and state plus history commit or roll back in one transaction.
- No product/demo activity is seeded; tests use disposable transaction-scoped fixtures.
- Dependencies remain pinned exactly and implementation follows RED to GREEN TDD.

---

### Task 1: Operator authority and append-only history foundation

**Files:**
- Create: `packages/db/migrations/202609010002_authority_history.sql`
- Create: `packages/db/src/authority.ts`
- Create: `packages/db/src/history.ts`
- Create: `packages/db/tests/authority-history.test.ts`
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: existing `profiles`, `app.current_auth_subject()`, `withActor`, `DATABASE_ADMIN_URL`, and restricted database roles.
- Produces: `profile_roles`, `audit_events`, `business_events`, `workflow_transitions`, `analytics_outbox`, `public.current_operator()`, `isCurrentActorOperator(actor)`, and explicit `grantOperator(input)` provisioning.

- [ ] **Step 1: Write the failing real-database tests**

Create UUID-scoped human profiles inside a transaction and assert:

```ts
expect(await isCurrentActorOperator({subject: ordinary.authSubject})).toBe(false)
await grantOperator({authSubject: operator.authSubject, grantedByAuthSubject: operator.authSubject})
expect(await isCurrentActorOperator({subject: operator.authSubject})).toBe(true)
```

Using restricted-role SQL, assert anonymous/authenticated `SELECT`, `INSERT`, `UPDATE`, and `DELETE` against every new table fail with permission denied. Assert malformed/blank claims make `current_operator()` return false. Insert one record in each history table through the platform test transaction, then assert update/delete fail. Force a transaction error after inserting a workflow transition and prove both the business mutation fixture and transition roll back. Granting a missing/IP profile must fail; granting the same active operator twice must be idempotent and produce only one active membership.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" DATABASE_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" DATABASE_USER_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" DATABASE_ADMIN_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" corepack pnpm --dir packages/db test -- authority-history.test.ts
```

Expected: FAIL because the migration, projection, and authority/history repositories do not exist.

- [ ] **Step 3: Implement the reviewed SQL migration**

Create enums `app_role ('operator')`, `audit_actor_type ('human','operator','system')`, `audit_source ('api','admin','worker')`, `audit_result ('succeeded','rejected','failed')`, and `outbox_state ('pending','delivered','failed')`.

Create:

- `profile_roles(profile_id, role, granted_by_profile_id, granted_at, revoked_at)` with one active membership per profile/role and checks/triggers requiring human profiles;
- `audit_events` with actor/action/entity/request/source/result and redacted `change_summary jsonb`;
- `business_events` with stable event name/version, actor, subject, request/environment and allow-listed `properties jsonb`;
- `workflow_transitions` with entity, previous/next state, actor, reason, operator note, request and occurrence time;
- `analytics_outbox` keyed by the matching business event, with destination, payload version/redacted payload, attempt scheduling, delivery state and last error code.

Use the exact indexes from `docs/superpowers/specs/2026-09-01-aifans-history-analytics-design.md` and `.superpowers/sdd/social-core-preflight.md`. Enable RLS, revoke `PUBLIC`, `aifans_anon`, and `aifans_authenticated` table access, and add triggers that reject update/delete on append-only rows. `public.current_operator()` is `SECURITY DEFINER`, fixes `search_path`, reads only the current claim subject, returns boolean, and grants execute only to `aifans_authenticated`.

- [ ] **Step 4: Implement narrow TypeScript composition**

`isCurrentActorOperator(actor)` runs `select public.current_operator()` only through `withActor`. `grantOperator(input)` trims and rejects blank subjects, resolves both profiles through the admin pool, requires human account kinds, inserts the active membership idempotently, and records an `operator_granted` audit event in the same transaction. It accepts no role name or arbitrary SQL/payload. `history.ts` exports typed internal helpers for atomic audit/business/workflow/outbox inserts; do not root-export raw pools or generic unrestricted JSON writers.

Add `DATABASE_PLATFORM_URL` by name only to `.env.example`; do not add a value or reuse `DATABASE_ADMIN_URL` automatically.

- [ ] **Step 5: Verify fresh migration and all boundaries**

Run:

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm db:start
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" DATABASE_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" corepack pnpm db:migrate
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" DATABASE_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" DATABASE_USER_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" DATABASE_ADMIN_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" corepack pnpm --dir packages/db test -- authority-history.test.ts
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db typecheck
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db build
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm test
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm license:check
git diff --check
```

Expected: the forward migration and focused/full tests pass; typecheck/build/license/diff checks exit 0; no hosted Neon mutation is required. The local owner URL is permitted only because tests explicitly switch into restricted roles before authorization assertions.

- [ ] **Step 6: Commit**

```bash
git add .env.example packages/db
git commit -m "feat: add social authority and history foundation"
```
