# Re-like Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `like -> unlike -> like` succeed without PostgreSQL `23505`, while preserving one historical notification and producing a fresh business/outbox event for each newly-created like relationship.

**Architecture:** Add one forward-only PostgreSQL migration that replaces the existing two-argument `public.like_post(uuid, uuid)` function in place. The relationship, business event, and outbox behavior remain unchanged; only the notification insert adopts the existing partial unique-index contract with `ON CONFLICT DO NOTHING`.

**Tech Stack:** PostgreSQL migrations and security-definer functions, TypeScript, Vitest, `pg`, pnpm, Docker Compose.

---

## File map

- Create `packages/db/migrations/202609030001_relike_notification.sql`: replace the deployed two-argument like command without deleting notification history, changing its signature, or relaxing `notifications_post_like_once_idx`.
- Modify `packages/db/tests/social-repository.test.ts`: add the missing end-to-end regression for like, unlike, and re-like, including relationship count, notification history, business events, and analytics outbox.

### Task 1: Capture the PostgreSQL 23505 regression

**Files:**
- Modify: `packages/db/tests/social-repository.test.ts:73`

- [ ] **Step 1: Start and migrate the local test database to the current pre-fix schema**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm db:start
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm db:migrate
```

Expected: PostgreSQL becomes healthy and migration output stops at the current checked-in migration; `202609030001_relike_notification.sql` does not exist yet.

- [ ] **Step 2: Add the failing sequence test immediately after the existing relationship-idempotency test**

Add this complete test inside `integration('social repository local postgres', ...)`:

```ts
it('allows like, unlike, and re-like while retaining one notification and emitting each created-like event', async () => tx(async (client) => {
  const actor = await human(client)
  const author = await ip(client)
  const postId = await post(client, author)
  const social = repo(client)

  await expect(social.likePost(actor, postId, context())).resolves.toEqual({created: true})
  await expect(social.unlikePost(actor, postId)).resolves.toEqual({deleted: true})
  await expect(social.likePost(actor, postId, context())).resolves.toEqual({created: true})

  await expect(client.query(
    'SELECT count(*)::int AS count FROM public.post_likes WHERE post_id=$1 AND profile_id=$2',
    [postId, actor.id],
  )).resolves.toMatchObject({rows: [{count: 1}]})
  await expect(client.query(
    "SELECT count(*)::int AS count FROM public.notifications WHERE recipient_profile_id=$1 AND actor_profile_id=$2 AND post_id=$3 AND kind='post_like'",
    [author, actor.id, postId],
  )).resolves.toMatchObject({rows: [{count: 1}]})
  await expect(client.query(
    "SELECT count(*)::int AS count FROM public.business_events WHERE actor_profile_id=$1 AND subject_entity_id=$2 AND event_name='post_liked'",
    [actor.id, postId],
  )).resolves.toMatchObject({rows: [{count: 2}]})
  await expect(client.query(
    "SELECT count(*)::int AS count FROM public.analytics_outbox outbox JOIN public.business_events event ON event.id=outbox.business_event_id WHERE event.actor_profile_id=$1 AND event.subject_entity_id=$2 AND event.event_name='post_liked'",
    [actor.id, postId],
  )).resolves.toMatchObject({rows: [{count: 2}]})
}))
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir packages/db test -- social-repository.test.ts -t "allows like, unlike, and re-like"
```

Expected: FAIL on the second `likePost` with PostgreSQL code `23505` for `notifications_post_like_once_idx`; the transaction does not reach the count assertions.

- [ ] **Step 4: Commit the regression test**

```bash
git add packages/db/tests/social-repository.test.ts
git commit -m "test(db): reproduce re-like notification conflict"
```

### Task 2: Replace the like command with a forward-only repair

**Files:**
- Create: `packages/db/migrations/202609030001_relike_notification.sql`
- Test: `packages/db/tests/social-repository.test.ts`

- [ ] **Step 1: Create the migration with the full replacement function**

Create `packages/db/migrations/202609030001_relike_notification.sql` with exactly this migration body:

```sql
-- Preserve the historical post-like notification when a human unlikes and
-- later likes the same public post again. The relationship and event rows are
-- fresh facts; the recipient notification remains unique by the deployed
-- notifications_post_like_once_idx partial index.
CREATE OR REPLACE FUNCTION public.like_post(target_post_id uuid, request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; owner_id uuid; did_create boolean := false; event_id uuid;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE = '42501'; END IF;
  SELECT p.author_profile_id INTO owner_id FROM public.posts p
  WHERE p.id = target_post_id AND public.is_published_post(p.id);
  IF owner_id IS NULL THEN RAISE EXCEPTION 'published post not found' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.post_likes(post_id, profile_id)
  VALUES(target_post_id, actor_id) ON CONFLICT DO NOTHING RETURNING true INTO did_create;
  IF did_create THEN
    event_id := gen_random_uuid();
    INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties)
    VALUES(event_id,'post_liked',1,actor_id,'post',target_post_id,request_id,'api',jsonb_build_object('event_id',event_id,'request_id',request_id));
    INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload)
    VALUES(gen_random_uuid(),event_id,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','post_liked','event_version',1,'request_id',request_id));
    IF owner_id <> actor_id THEN
      INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind,post_id)
      VALUES(gen_random_uuid(),owner_id,actor_id,'post_like',target_post_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN COALESCE(did_create, false);
END $$;

REVOKE ALL ON FUNCTION public.like_post(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.like_post(uuid,uuid) TO aifans_authenticated;
```

Do not add a `DELETE` against `public.notifications`, do not drop or replace `notifications_post_like_once_idx`, and do not create a new overload.

- [ ] **Step 2: Apply the new migration**

Run:

```bash
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm db:migrate
```

Expected: stdout contains exactly the newly applied filename `202609030001_relike_notification.sql`; the runner records its checksum in `app_migrations.schema_migrations`.

- [ ] **Step 3: Re-run the regression and verify GREEN**

Run:

```bash
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir packages/db test -- social-repository.test.ts -t "allows like, unlike, and re-like"
```

Expected: PASS; the final relationship count is `1`, historical notification count is `1`, and both event counts are `2`.

- [ ] **Step 4: Run all social repository integration tests**

Run:

```bash
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir packages/db test -- social-repository.test.ts
```

Expected: PASS, including the existing duplicate-like, duplicate-unlike, hidden-post, permission, and transaction-rollback coverage.

- [ ] **Step 5: Commit the forward migration**

```bash
git add packages/db/migrations/202609030001_relike_notification.sql
git commit -m "fix(db): preserve notification on post re-like"
```

### Task 3: Verify the isolated deliverable

**Files:**
- Test: `packages/db/tests/social-repository.test.ts`
- Test: `packages/db/tests/migrate.test.ts`
- Test: `packages/db/tests/migrate.integration.test.ts`

- [ ] **Step 1: Run the complete database verification**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm db:test
```

Expected: all database unit and integration tests PASS and the migration runner applies the forward migration without checksum or transaction errors.

- [ ] **Step 2: Run repository-wide safety checks**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm test
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm typecheck
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm build
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm license:check
git diff --check
```

Expected: every command exits `0`; no product contract or Web/API behavior changes are required by this isolated repair.

- [ ] **Step 3: Record the verified code state**

Run:

```bash
git status --short
git log -2 --oneline
```

Expected: no uncommitted implementation files remain; the two newest commits are the regression test and the forward migration.

### Task 4: Apply and accept the repair in Preview

**Files:**
- Inspect: `packages/db/migrations/202609030001_relike_notification.sql`
- Inspect: `docs/operations/HANDOFF.md`

- [ ] **Step 1: Pin the exact candidate SHA and verify the Preview database target**

Run:

```bash
git rev-parse HEAD
git status --short
```

Expected: save the printed SHA as the only SHA to deploy, and the worktree is clean. In the Neon/Vercel consoles, verify the selected Preview project uses its isolated Preview Neon branch and restricted runtime role URLs; do not point Preview or tests at production.

- [ ] **Step 2: Apply only forward migrations with the Preview owner credential**

With `PREVIEW_DATABASE_URL` set to the Preview runtime/test URL and `PREVIEW_DATABASE_ADMIN_URL` set to the Preview owner URL in the operator shell, run:

```bash
DATABASE_URL="$PREVIEW_DATABASE_URL" DATABASE_ADMIN_URL="$PREVIEW_DATABASE_ADMIN_URL" PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir packages/db migrate
```

Expected: stdout lists `202609030001_relike_notification.sql` once. A second invocation prints no migration filename and exits `0`. Never print, paste into Git, or commit either URL.

- [ ] **Step 3: Deploy the pinned SHA to both API and Web Preview projects**

Use the Vercel project dashboard to deploy the SHA from Step 1 to the API Preview project and then the Web Preview project. Confirm both deployment detail pages show that exact Git SHA and the Preview environment variables, not Production variables.

Expected: both Preview deployments become Ready and identify the same SHA.

- [ ] **Step 4: Run the real Preview acceptance sequence**

On a published test post owned by another visible IP, sign in as a human and perform: Like, Unlike, Like. Refresh the post detail and its containing feed.

Expected: all three requests avoid 5xx responses; the final UI remains liked with count `1` for this test actor, refresh preserves that state, the notification history contains only its original post-like notification, and API logs contain no new `23505` or `notifications_post_like_once_idx` error.

- [ ] **Step 5: Preserve deployment evidence**

Record the Preview API URL, Preview Web URL, exact SHA, migration ledger row name, acceptance post ID, request IDs for the three mutations, and the no-5xx log search result in the release notes or task record. Do not record credentials, cookies, bearer tokens, database URLs, or raw user/network identifiers.
