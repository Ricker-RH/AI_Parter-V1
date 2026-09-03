# Authoritative Interaction Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose durable bookmark/share totals on every post payload and make successful native-share or copy actions record an idempotent, privacy-preserving server event for signed-in and signed-out viewers.

**Architecture:** A forward PostgreSQL migration adds a write-only share ledger keyed by `(post_id, idempotency_key)`, a lock-safe optional-actor command, normalizes the platform-comment command to the existing post → IP lock order, and adds two fields to the existing post-metrics/search projections without changing ranking. The shared strict contract then forces every feed/detail producer and fixture to carry both counts; the API and same-origin Web BFF independently validate a UUID `Idempotency-Key`, request-stream presence, exact JSON media type, and the empty share command, while the shared post action component generates one key per completed browser share and reuses it across a bounded recording retry.

**Tech Stack:** PostgreSQL, Drizzle schema declarations, TypeScript, Zod, Hono, Next.js 16 App Router, React 19, Vitest/Testing Library, pnpm, Docker Compose.

---

## File map

### Database and repository

- Create `packages/db/migrations/202609030002_interaction_counts.sql`: create `post_share_events`, its `post_id`-leading index, `record_post_share`, replace `platform_publish_ip_comment` in place so all comment/share commands use the canonical post → IP lock order, expand `social_post_metrics`, and recreate the search-post projection.
- Modify `packages/db/src/schema.ts`: declare the share ledger for schema parity.
- Modify `packages/db/src/index.ts`: export `postShareEvents`.
- Modify `packages/db/src/social.ts`: project both counts, adapt the legacy platform-publish row with transactionally known zeros, and implement `recordPostShare(viewer, postId, idempotencyKey)` through the correct anonymous/authenticated session.
- Modify `packages/db/tests/social-repository.test.ts`: integration coverage for both actor modes, post-scoped idempotency, visibility races, privacy, and every post producer.
- Modify `packages/db/tests/social-feed-projection.unit.test.ts`: row fixture and mapping assertions.
- Modify `packages/db/tests/social-search.test.ts`: expanded search projection/fixture assertions.
- Modify `packages/db/tests/platform-social.test.ts`: legacy platform-publish row adapter expectations, post-before-IP source assertions, and combined-error precedence coverage.

### Contract and API

- Modify `packages/contracts/src/social.ts`: required non-negative `bookmarkCount`/`shareCount` and strict `ShareRecordedSchema`.
- Modify `packages/contracts/src/social.test.ts`: required-field and numeric-boundary contract tests.
- Modify `apps/api/src/ports/social.ts`: optional-viewer share command.
- Modify `apps/api/src/routes/social.ts`: strict optional-auth `POST /v1/posts/:postId/share`.
- Modify `apps/api/src/routes/social.test.ts`: route, optional auth, validation, strict response, not-found and redaction tests.
- Modify `apps/api/src/middleware/rate-limit.ts`: classify share recording as `social_mutation`.
- Modify `apps/api/src/hardening.test.ts`: prove anonymous share recording is rate limited through the signed identity path.
- Modify `apps/api/src/routes/admin.test.ts`: update its strict published-post fixture.

### Web BFF and UI

- Modify `apps/web/src/app/api/social/[...path]/route.ts`: allow only same-origin, queryless share POSTs with a UUID idempotency key and an absent or strict-empty JSON body; validate `{created:boolean}`.
- Modify `apps/web/src/app/api/social/[...path]/route.test.tsx`: allow-list, empty-body, optional token, header hygiene, cache and response tests.
- Modify `apps/web/src/lib/server-api.ts`: forward an already validated idempotency key only through a dedicated trusted option.
- Modify `apps/web/src/lib/server-api.test.tsx`: prove browser-supplied keys are stripped and the explicit trusted key is forwarded.
- Modify `apps/web/src/lib/social-invalidation.ts`: invalidate public feed tags after bookmark/share count changes.
- Modify `apps/web/src/lib/social-invalidation.test.ts`: fixed invalidation mapping.
- Modify `apps/web/src/components/social/PostActions.tsx`: render all counts, optimistic bookmark total, share/copy recording, cancellation neutrality, independent pending/error state, and stale-request reset.
- Modify `apps/web/src/components/social/PostActions.test.tsx`: zero/count accessibility, bookmark/share state transitions, cancellation/failure and identity reset.
- Modify `apps/web/src/components/social/PostCard.tsx`: pass both authoritative totals.
- Modify `apps/web/src/components/social/PostCard.test.tsx`: update the post fixture and integration assertions.
- Modify `apps/web/src/app/globals.css`: keep all four controls on one stable row and place independently scoped action feedback on its own full-width wrapping row.

### Strict `FeedPost` fixture updates

The contract has no fallback. Add `bookmarkCount` and `shareCount` to every strict post literal in these files as part of the atomic Task 2 batch; do not make either field optional to silence errors:

- `apps/web/src/lib/social-api.test.tsx`
- `apps/web/src/lib/social-cache.test.tsx`
- `apps/web/src/components/social/SocialContent.test.tsx`
- `apps/web/src/components/profile/MyProfileTabs.test.tsx`
- `apps/web/src/components/social/PublicProfileContent.test.tsx`
- `apps/web/src/components/social/search-ranking.test.ts`
- `apps/web/src/app/[locale]/posts/[postId]/page.test.tsx`
- `apps/web/src/app/[locale]/search/page.test.tsx`
- `apps/web/src/components/admin/AdminConsole.test.tsx`

`packages/contracts/src/creator.ts`, `packages/contracts/src/creator.test.ts`, and `apps/web/src/components/creator/CreatorAnalytics.tsx` also contain `likeCount`/`commentCount`, but those fields belong to the separate creator analytics DTO rather than `FeedPost`; leave them unchanged.

### Task 1: Specify the durable ledger and count projection in failing database tests

**Files:**
- Modify: `packages/db/tests/social-repository.test.ts:58-93`
- Modify: `packages/db/tests/social-search.test.ts:18-32`

- [ ] **Step 1: Make the anonymous test session preserve writes until the outer test rollback**

Replace the `withPublic` callback inside the `repo(client)` test helper with this nested-session implementation. The existing helper uses `ROLLBACK TO SAVEPOINT`, which is correct for read-only tests but would erase the anonymous share fact before it can be asserted:

```ts
withPublic: async (fn) => {
  await client.query('SAVEPOINT anon')
  try {
    await client.query('SET LOCAL ROLE aifans_anon')
    await client.query("SELECT set_config('request.jwt.claims','{}',true)")
    const value = await fn({query: client.query.bind(client), release() {}})
    await client.query('SET LOCAL ROLE NONE')
    await client.query('RELEASE SAVEPOINT anon')
    return value
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT anon').catch(() => undefined)
    await client.query('RELEASE SAVEPOINT anon').catch(() => undefined)
    throw error
  }
},
```

The outer `tx(...)` still rolls back every fixture and share row at test completion.

- [ ] **Step 2: Add failing share-ledger integration coverage**

Add these tests inside `integration('social repository local postgres', ...)`; they deliberately name the repository method that Task 2 will define:

```ts
it('records authenticated and anonymous shares idempotently without network metadata', async () => tx(async (client) => {
  const author = await ip(client)
  const postId = await post(client, author)
  const otherPostId = await post(client, author)
  const actor = await human(client)
  const social = repo(client)
  const authenticatedKey = randomUUID()
  const anonymousKey = randomUUID()

  await expect(social.recordPostShare(actor, postId, authenticatedKey)).resolves.toEqual({created: true})
  await expect(social.recordPostShare(actor, postId, authenticatedKey)).resolves.toEqual({created: false})
  await expect(social.recordPostShare(null, postId, anonymousKey)).resolves.toEqual({created: true})
  await expect(social.recordPostShare(null, postId, randomUUID())).resolves.toEqual({created: true})
  await expect(social.recordPostShare(null, otherPostId, authenticatedKey)).resolves.toEqual({created: true})

  const rows = await client.query<{actor_profile_id: string | null; idempotency_key: string}>(
    'SELECT actor_profile_id,idempotency_key FROM public.post_share_events WHERE post_id=$1 ORDER BY idempotency_key',
    [postId],
  )
  expect(rows.rows).toHaveLength(3)
  expect(rows.rows.filter((row) => row.actor_profile_id === actor.id)).toHaveLength(1)
  expect(rows.rows.filter((row) => row.actor_profile_id === null)).toHaveLength(2)
  const columns = await client.query<{column_name: string}>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='post_share_events' ORDER BY ordinal_position",
  )
  expect(columns.rows.map((row) => row.column_name)).toEqual(['id', 'post_id', 'actor_profile_id', 'idempotency_key', 'created_at'])
  const constraints = await client.query<{definition: string}>(
    "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='post_share_events_post_id_idempotency_key_unique'",
  )
  expect(constraints.rows[0]?.definition).toContain('UNIQUE (post_id, idempotency_key)')
  const indexes = await client.query<{indexdef: string}>(
    "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='post_share_events_post_created_idx'",
  )
  expect(indexes.rows[0]?.indexdef).toContain('(post_id, created_at DESC)')
}))

it('rejects shares outside the public current projection and exposes only the bounded command', async () => tx(async (client) => {
  const actor = await human(client)
  const visibleAuthor = await ip(client)
  const hiddenAuthor = await ip(client, 'draft')
  const draft = await post(client, visibleAuthor, 'draft')
  const withdrawn = await post(client, visibleAuthor, 'withdrawn')
  const hidden = await post(client, hiddenAuthor)
  const social = repo(client)

  for (const target of [draft, withdrawn, hidden, randomUUID()]) {
    await expect(social.recordPostShare(actor, target, randomUUID())).rejects.toMatchObject({code: 'P0002'})
    await expect(social.recordPostShare(null, target, randomUUID())).rejects.toMatchObject({code: 'P0002'})
  }

  await client.query('SET LOCAL ROLE aifans_anon')
  const anon = await client.query<{execute: boolean; select_rows: boolean}>(
    "SELECT has_function_privilege(current_user,'public.record_post_share(uuid,uuid)','EXECUTE') execute,has_table_privilege(current_user,'public.post_share_events','SELECT') select_rows",
  )
  expect(anon.rows[0]).toEqual({execute: true, select_rows: false})
  await client.query('SET LOCAL ROLE NONE')
  await client.query('SET LOCAL ROLE aifans_authenticated')
  const authenticated = await client.query<{execute: boolean; select_rows: boolean; insert_rows: boolean}>(
    "SELECT has_function_privilege(current_user,'public.record_post_share(uuid,uuid)','EXECUTE') execute,has_table_privilege(current_user,'public.post_share_events','SELECT') select_rows,has_table_privilege(current_user,'public.post_share_events','INSERT') insert_rows",
  )
  expect(authenticated.rows[0]).toEqual({execute: true, select_rows: false, insert_rows: false})
}))

it('rejects a published creator IP without an active creator revision', async () => tx(async (client) => {
  const creator = await human(client)
  const author = await ip(client)
  await client.query(
    "UPDATE public.ip_profiles SET source='creator',creator_profile_id=$2,active_creator_revision_id=NULL WHERE profile_id=$1",
    [author, creator.id],
  )
  const postId = await post(client, author)
  const actor = await human(client)
  const social = repo(client)

  await expect(client.query('SELECT 1 FROM public.social_public_posts() WHERE post_id=$1', [postId])).resolves.toMatchObject({rowCount:0})
  await expect(social.recordPostShare(actor, postId, randomUUID())).rejects.toMatchObject({code:'P0002'})
  await expect(client.query('SELECT 1 FROM public.post_share_events WHERE post_id=$1', [postId])).resolves.toMatchObject({rowCount:0})
}))
```

Add these committed-fixture and bounded lock-probe helpers beside the existing comment concurrency helpers. Import `afterEach` and `createPlatformSession`. The cleanup is test-owner-only, targets exact generated IDs, disables only the named append-only/delete guards needed for those rows inside one rollback-safe transaction, and is registered before the committed fixture is returned so a failed assertion cannot pollute later local runs:

```ts
type CommittedShareFixture = {
  author: string
  represented: string
  actor: Awaited<ReturnType<typeof human>>
  operator: Awaited<ReturnType<typeof human>>
  postId: string
}
const committedShareFixtures = new Set<CommittedShareFixture>()

async function committedShareFixture(): Promise<CommittedShareFixture> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const author = await ip(client)
    const represented = await ip(client)
    const actor = await human(client)
    const operator = await human(client)
    await client.query(
      "INSERT INTO public.profile_roles(profile_id,role,granted_by_profile_id) VALUES($1,'operator',$1)",
      [operator.id],
    )
    const postId = await post(client, author)
    await client.query('COMMIT')
    const fixture = {author, represented, actor, operator, postId}
    committedShareFixtures.add(fixture)
    return fixture
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function cleanupCommittedShareFixture(fixture: CommittedShareFixture) {
  if (!committedShareFixtures.has(fixture)) return
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET CONSTRAINTS ALL DEFERRED')
    const comments = await client.query<{id:string}>('SELECT id FROM public.comments WHERE post_id=$1', [fixture.postId])
    const commentIds = comments.rows.map((row) => row.id)
    if (commentIds.length) {
      await client.query('ALTER TABLE public.analytics_outbox DISABLE TRIGGER analytics_outbox_guard')
      await client.query('ALTER TABLE public.business_events DISABLE TRIGGER business_events_append_only')
      await client.query('ALTER TABLE public.audit_events DISABLE TRIGGER audit_events_append_only')
      await client.query('ALTER TABLE public.workflow_transitions DISABLE TRIGGER workflow_transitions_append_only')
      await client.query("DELETE FROM public.analytics_outbox WHERE business_event_id IN (SELECT id FROM public.business_events WHERE subject_entity_type='comment' AND subject_entity_id=ANY($1::uuid[]))", [commentIds])
      await client.query("DELETE FROM public.business_events WHERE subject_entity_type='comment' AND subject_entity_id=ANY($1::uuid[])", [commentIds])
      await client.query("DELETE FROM public.audit_events WHERE entity_type='comment' AND entity_id=ANY($1::uuid[])", [commentIds])
      await client.query("DELETE FROM public.workflow_transitions WHERE entity_type='comment' AND entity_id=ANY($1::uuid[])", [commentIds])
      await client.query('ALTER TABLE public.analytics_outbox ENABLE TRIGGER analytics_outbox_guard')
      await client.query('ALTER TABLE public.business_events ENABLE TRIGGER business_events_append_only')
      await client.query('ALTER TABLE public.audit_events ENABLE TRIGGER audit_events_append_only')
      await client.query('ALTER TABLE public.workflow_transitions ENABLE TRIGGER workflow_transitions_append_only')
      await client.query('DELETE FROM public.notifications WHERE comment_id=ANY($1::uuid[])', [commentIds])
      await client.query('DELETE FROM public.comment_likes WHERE comment_id=ANY($1::uuid[])', [commentIds])
      await client.query('ALTER TABLE public.comments DISABLE TRIGGER comments_reject_delete')
      await client.query('DELETE FROM public.comments WHERE id=ANY($1::uuid[])', [commentIds])
      await client.query('ALTER TABLE public.comments ENABLE TRIGGER comments_reject_delete')
    }
    await client.query('DELETE FROM public.notifications WHERE post_id=$1', [fixture.postId])
    await client.query('DELETE FROM public.post_share_events WHERE post_id=$1', [fixture.postId])
    await client.query('DELETE FROM public.post_likes WHERE post_id=$1', [fixture.postId])
    await client.query('DELETE FROM public.bookmarks WHERE post_id=$1', [fixture.postId])
    await client.query('ALTER TABLE public.posts DISABLE TRIGGER posts_reject_delete')
    await client.query('DELETE FROM public.posts WHERE id=$1', [fixture.postId])
    await client.query('ALTER TABLE public.posts ENABLE TRIGGER posts_reject_delete')
    await client.query('DELETE FROM public.profile_roles WHERE profile_id=$1', [fixture.operator.id])
    const ipIds = [fixture.author, fixture.represented]
    await client.query("UPDATE public.ip_profiles SET public_state='draft',operation_enabled=false,current_identity_revision_id=NULL WHERE profile_id=ANY($1::uuid[])", [ipIds])
    await client.query('ALTER TABLE public.ip_identity_revisions DISABLE TRIGGER ip_identity_revisions_immutable')
    await client.query('DELETE FROM public.ip_identity_revisions WHERE ip_profile_id=ANY($1::uuid[])', [ipIds])
    await client.query('ALTER TABLE public.ip_identity_revisions ENABLE TRIGGER ip_identity_revisions_immutable')
    await client.query('DELETE FROM public.ip_profiles WHERE profile_id=ANY($1::uuid[])', [ipIds])
    await client.query('DELETE FROM public.profiles WHERE id=ANY($1::uuid[])', [[...ipIds, fixture.actor.id, fixture.operator.id]])
    await client.query('COMMIT')
    committedShareFixtures.delete(fixture)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

afterEach(async () => {
  for (const fixture of [...committedShareFixtures]) await cleanupCommittedShareFixture(fixture)
})

async function expectSessionToWaitOnLock(
  observer: PoolClient,
  blockedPid: number,
  attempt: Promise<unknown>,
) {
  let blocked = false
  for (let poll = 0; poll < 50; poll += 1) {
    const activity = await observer.query<{wait_event_type:string|null}>('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [blockedPid])
    if (activity.rows[0]?.wait_event_type === 'Lock') {
      blocked = true
      break
    }
    const settled = await Promise.race([attempt.then(() => true), new Promise<false>((resolve) => setTimeout(() => resolve(false), 10))])
    if (settled) break
  }
  expect(blocked).toBe(true)
}
```

Then add two two-connection tests. The state-changing transaction acquires its update lock first; the share call must block, observe the committed state, reject with `P0002`, and leave no ledger row. PostgreSQL aborts the share transaction after `P0002`, so roll it back before observing through the still-valid state connection; the finalizer must tolerate the earlier rollback:

```ts
it.each(['withdraw', 'unpublish'] as const)('does not record when concurrent %s wins the visibility lock', async (change) => {
  const fixture = await committedShareFixture()
  const stateClient = await pool.connect()
  const shareClient = await pool.connect()
  try {
    await stateClient.query('BEGIN')
    if (change === 'withdraw') {
      await stateClient.query("UPDATE public.posts SET state='withdrawn',withdrawn_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1", [fixture.postId])
    } else {
      await stateClient.query("UPDATE public.ip_profiles SET public_state='unpublished',operation_enabled=false,updated_at=clock_timestamp() WHERE profile_id=$1", [fixture.author])
    }
    await shareClient.query('BEGIN')
    const sharePid = (await shareClient.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
    const attempt = repo(shareClient).recordPostShare(null, fixture.postId, randomUUID()).then(() => ({ok:true as const})).catch((error:unknown) => ({ok:false as const,error}))
    await expectSessionToWaitOnLock(stateClient, sharePid, attempt)
    await stateClient.query('COMMIT')
    const outcome = await attempt
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toMatchObject({code:'P0002'})
    await shareClient.query('ROLLBACK')
    await expect(stateClient.query('SELECT 1 FROM public.post_share_events WHERE post_id=$1', [fixture.postId])).resolves.toMatchObject({rowCount:0})
  } finally {
    await Promise.all([stateClient.query('ROLLBACK').catch(() => undefined), shareClient.query('ROLLBACK').catch(() => undefined)])
    stateClient.release()
    shareClient.release()
    await cleanupCommittedShareFixture(fixture)
  }
})
```

Add deterministic three-connection lock-order probes for both comment commands. A blocker holds the target post, then share and comment start concurrently; `expectSessionToWaitOnLock` must observe both sessions waiting on that post before the blocker commits. Set transaction-local `lock_timeout='2s'` and `statement_timeout='4s'` immediately after every blocker/share/comment `BEGIN`, and wrap every command attempt plus the first/second settlement in the bounded helper below. This makes a non-deadlock lock regression fail instead of hanging Vitest.

After the blocker commit, wait only for the first command statement to finish. Assert its outcome is not `40P01` and is successful, query its still-open transaction to prove its row exists exactly once, then immediately roll back that command transaction to release the post/IP locks. Only then wait for and assert the second command. Waiting for both statements before rolling back the winner would make the probe block itself because the winner retains its row locks until transaction end.

Run one case through `createHumanComment` and one through `createPlatformSession(..., {transactionMode:'nested'}).withPlatformActor(...)` calling `platform_publish_ip_comment` with `fixture.represented`. Use unique body markers and request IDs. Capture all three backend PIDs after `BEGIN`. Every `finally` must use an independent pool query to cancel any still-active fixture backend, settle outstanding attempts within the deadline, roll back with a bound, destroy a client whose rollback cannot complete, release all clients, and call `cleanupCommittedShareFixture(fixture)`.

```ts
async function bounded<T>(promise: Promise<T>, label: string, timeoutMs = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function beginBounded(client: PoolClient) {
  await client.query('BEGIN')
  await client.query("SET LOCAL lock_timeout='2s'")
  await client.query("SET LOCAL statement_timeout='4s'")
}

async function rollbackAndRelease(client: PoolClient) {
  try {
    await bounded(client.query('ROLLBACK'), 'rollback', 5_000)
    client.release()
  } catch {
    client.release(true) // cancel/remove a connection that cannot be recovered
  }
}

type TaggedOutcome = {
  kind: 'share' | 'comment'
  outcome: {ok:true; value:unknown} | {ok:false; error:unknown}
}

// After beginBounded(blocker/share/comment), blocker locks fixture.postId and
// both raw command statements are started and observed waiting on the blocker.
const shareAttempt = bounded(
  rawShareAttempt.then((value) => ({ok:true as const, value})).catch((error:unknown) => ({ok:false as const, error})),
  'share statement',
)
const commentAttempt = bounded(
  rawCommentAttempt.then((value) => ({ok:true as const, value})).catch((error:unknown) => ({ok:false as const, error})),
  'comment statement',
)
const taggedShare = shareAttempt.then((outcome): TaggedOutcome => ({kind:'share', outcome}))
const taggedComment = commentAttempt.then((outcome): TaggedOutcome => ({kind:'comment', outcome}))

await bounded(blocker.query('COMMIT'), 'blocker commit')
const first = await bounded(Promise.race([taggedShare, taggedComment]), 'first command settlement')
if (!first.outcome.ok) expect(first.outcome.error).not.toMatchObject({code:'40P01'})
expect(first.outcome.ok).toBe(true)
await bounded(assertOwnTransactionRowCount(first.kind, 1), 'first row assertion')
await bounded((first.kind === 'share' ? shareClient : commentClient).query('ROLLBACK'), 'first command rollback')

const second = await bounded(first.kind === 'share' ? taggedComment : taggedShare, 'second command settlement')
if (!second.outcome.ok) expect(second.outcome.error).not.toMatchObject({code:'40P01'})
expect(second.outcome.ok).toBe(true)
await bounded(assertOwnTransactionRowCount(second.kind, 1), 'second row assertion')
await bounded((second.kind === 'share' ? shareClient : commentClient).query('ROLLBACK'), 'second command rollback')

// In finally:
await bounded(
  pool.query('SELECT pg_cancel_backend(pid) FROM unnest($1::int[]) AS active(pid)', [[blockerPid, sharePid, commentPid]]),
  'backend cancellation',
).catch(() => undefined)
await Promise.allSettled([
  bounded(shareAttempt, 'share cleanup'),
  bounded(commentAttempt, 'comment cleanup'),
])
await Promise.all([
  rollbackAndRelease(blocker),
  rollbackAndRelease(shareClient),
  rollbackAndRelease(commentClient),
])
await cleanupCommittedShareFixture(fixture)
```

The lock probes must also assert the migrated function definitions, not timing alone: `create_human_comment`, `record_post_share`, and `platform_publish_ip_comment` each lock `public.posts` before any `public.ip_profiles`; the platform definition locks both IP rows with `WHERE ip.profile_id IN (...) ORDER BY ip.profile_id FOR UPDATE OF ip, r`. This proves the platform replacement preserves a deterministic order for distinct target-author and represented profiles.

```ts
const definitions = await observer.query<{name:string; definition:string}>(`
  SELECT p.proname AS name, pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('record_post_share','create_human_comment','platform_publish_ip_comment')
`)
const byName = new Map(definitions.rows.map((row) => [row.name, row.definition]))
for (const name of ['record_post_share', 'create_human_comment', 'platform_publish_ip_comment']) {
  expect(byName.get(name)).toMatch(/FROM public\.posts[\s\S]*FOR (?:SHARE|UPDATE)(?: OF \w+)?;[\s\S]*FROM public\.ip_profiles/)
}
expect(byName.get('platform_publish_ip_comment')).toMatch(/WHERE ip\.profile_id IN \([^)]+\)[\s\S]*ORDER BY ip\.profile_id[\s\S]*FOR UPDATE OF ip, r/)
```

- [ ] **Step 3: Strengthen producer/count coverage in the existing integration tests**

In the first feed test, create two bookmarks and two share events, then assert the anonymous feed item contains both aggregates while viewer bookmark ownership remains actor-scoped:

```ts
await social.bookmarkPost(first, visible)
await social.bookmarkPost(second, visible)
await social.recordPostShare(first, visible, randomUUID())
await social.recordPostShare(null, visible, randomUUID())
const anon = await social.listFeed({viewer: null, kind: 'for_you', limit: 25, after: null})
expect(anon.items[0]).toMatchObject({likeCount: 1, commentCount: 0, bookmarkCount: 2, shareCount: 2})
expect((await social.listFeed({viewer: first, kind: 'for_you', limit: 25, after: null})).items[0]).toMatchObject({viewerHasBookmarked: true})
```

Replace the current author-only producer test with one that retains its author assertions and also checks every producer:

```ts
it('populates strict interaction counts for feed, following, liked, bookmarks, search, profile, and detail', async () => tx(async (client) => {
  const author = await ip(client)
  const actor = await human(client)
  const postId = await post(client, author)
  const social = repo(client)
  await social.follow(actor, author, context())
  await social.likePost(actor, postId, context())
  await social.bookmarkPost(actor, postId)
  await social.recordPostShare(actor, postId, randomUUID())

  const pages = [
    await social.listFeed({viewer: null, kind: 'for_you', limit: 10, after: null}),
    await social.listFeed({viewer: actor, kind: 'following', limit: 10, after: null}),
    await social.listBookmarks(actor, {limit: 10}),
    await social.listLiked(actor, {limit: 10}),
  ]
  const search = await social.search({viewer: null, q: 'fixture', category: 'posts', limit: 10, after: null})
  const profile = await social.getPublicProfile({viewer: null, profileId: author, limit: 10, after: null})
  const detail = await social.getPost({viewer: null, postId, commentLimit: 10, commentAfter: null})
  if (profile) pages.push(profile.posts)
  const posts = [
    ...pages.flatMap((page) => page.items),
    ...search.items.flatMap((item) => item.type === 'post' ? [item.post] : []),
    ...(detail ? [detail] : []),
  ]
  expect(posts).toHaveLength(7)
  for (const value of posts) {
    expect(value).toMatchObject({likeCount: 1, commentCount: 0, bookmarkCount: 1, shareCount: 1})
    expect(PublicIpSchema.parse(value.author)).toEqual(value.author)
  }
}))
```

- [ ] **Step 4: Expand the migration-source assertion in `social-search.test.ts`**

Point the test at the new migration and assert both output fields:

```ts
const migration = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../migrations/202609030002_interaction_counts.sql'), 'utf8')
expect(migration).toContain('bookmark_count integer')
expect(migration).toContain('share_count integer')
expect(migration).toContain('metrics.bookmark_count,metrics.share_count')
expect(migration).toContain('post_share_events_post_id_idempotency_key_unique')
expect(migration).toContain('ON CONFLICT ON CONSTRAINT post_share_events_post_id_idempotency_key_unique DO NOTHING')
expect(migration).toMatch(/FROM public\.posts post[\s\S]*FOR SHARE[\s\S]*FROM public\.ip_profiles ip[\s\S]*FOR SHARE/)
expect(migration).toMatch(/ip\.source,ip\.current_identity_revision_id,ip\.active_creator_revision_id[\s\S]*owner_source='creator'[\s\S]*FROM public\.creator_revisions creator_revision/)
expect(migration).toContain('CREATE OR REPLACE FUNCTION public.platform_publish_ip_comment')
expect(migration).toMatch(/platform_publish_ip_comment[\s\S]*FROM public\.posts target[\s\S]*FOR UPDATE OF target[\s\S]*FROM public\.ip_profiles ip[\s\S]*ORDER BY ip\.profile_id[\s\S]*FOR UPDATE OF ip, r/)
expect(migration).toMatch(/SELECT target\.author_profile_id,target\.state[\s\S]*WHERE target\.id=target_post_id\s+FOR UPDATE OF target[\s\S]*'IP not publishable'[\s\S]*IF target_post_state<>'published'/)
expect(migration).not.toMatch(/WHERE target\.id=target_post_id AND target\.state='published'\s+FOR UPDATE OF target/)
expect(migration).toContain("SECURITY DEFINER SET search_path = ''")
expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.social_public_search_posts')
```

- [ ] **Step 5: Run focused tests and verify RED**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm db:start
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir packages/db test -- social-repository.test.ts social-search.test.ts
```

Expected: FAIL because `recordPostShare` and `202609030002_interaction_counts.sql` do not exist; no test should be skipped when `DATABASE_URL` is set.

- [ ] **Step 6: Commit the failing database tests**

```bash
git add packages/db/tests/social-repository.test.ts packages/db/tests/social-search.test.ts
git commit -m "test(db): specify durable share counts"
```

### Task 2: Atomically add the ledger, aggregate projection, and strict contract

This is one implementation/review unit. Part A changes the database/repository producer shape; Part B immediately makes that shape mandatory in the shared contract and updates every strict fixture. Do not typecheck, claim GREEN, commit, or hand off between the two parts: either half alone is intentionally transitional and cannot satisfy the workspace's strict TypeScript/schema contract.

#### Part A: Database, repository, and platform adapter

**Files:**
- Create: `packages/db/migrations/202609030002_interaction_counts.sql`
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/src/social.ts`
- Modify: `packages/db/tests/social-feed-projection.unit.test.ts`
- Modify: `packages/db/tests/platform-social.test.ts`

- [ ] **Step 1: Create the forward migration**

Create `packages/db/migrations/202609030002_interaction_counts.sql` with this complete SQL:

```sql
CREATE TABLE public.post_share_events (
  id uuid PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id),
  actor_profile_id uuid REFERENCES public.profiles(id),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_share_events_post_id_idempotency_key_unique UNIQUE(post_id,idempotency_key)
);
CREATE INDEX post_share_events_post_created_idx ON public.post_share_events(post_id, created_at DESC);
REVOKE ALL ON TABLE public.post_share_events FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;

CREATE FUNCTION public.record_post_share(target_post_id uuid, command_idempotency_key uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor_id uuid;
  owner_id uuid;
  owner_source public.ip_source;
  current_revision_id uuid;
  active_creator_revision_id uuid;
  did_create boolean := false;
BEGIN
  SELECT post.author_profile_id INTO owner_id
  FROM public.posts post
  WHERE post.id=target_post_id AND post.state='published'
  FOR SHARE;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'published post not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT ip.source,ip.current_identity_revision_id,ip.active_creator_revision_id
  INTO owner_source,current_revision_id,active_creator_revision_id
  FROM public.ip_profiles ip
  WHERE ip.profile_id=owner_id AND ip.public_state='published'
  FOR SHARE;
  IF owner_source IS NULL OR current_revision_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.ip_identity_revisions identity
    WHERE identity.id=current_revision_id AND identity.ip_profile_id=owner_id
  ) OR (
    owner_source='creator' AND (
      active_creator_revision_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.creator_revisions creator_revision
        WHERE creator_revision.id=active_creator_revision_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'published post not found' USING ERRCODE = 'P0002';
  END IF;

  actor_id := public.social_current_human_profile_id();
  INSERT INTO public.post_share_events(id,post_id,actor_profile_id,idempotency_key)
  VALUES(gen_random_uuid(),target_post_id,actor_id,command_idempotency_key)
  ON CONFLICT ON CONSTRAINT post_share_events_post_id_idempotency_key_unique DO NOTHING
  RETURNING true INTO did_create;
  RETURN COALESCE(did_create,false);
END $$;
REVOKE ALL ON FUNCTION public.record_post_share(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_post_share(uuid,uuid) TO aifans_anon,aifans_authenticated;

-- Keep every command that locks a post and IP profile on the same post -> IP
-- order. Preserve the platform command's signature, authorization, business
-- writes, return shape, and deterministic UUID ordering for its two IP rows.
CREATE OR REPLACE FUNCTION public.platform_publish_ip_comment(
  target_post_id uuid,
  represented_ip_profile_id uuid,
  requested_body text,
  requested_parent_comment_id uuid,
  request_id uuid
)
RETURNS TABLE(
  comment_id uuid, post_id uuid, parent_comment_id uuid, body text, created_at timestamptz,
  id uuid, username text, display_name text, bio text, languages text[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operator_id uuid;
  target_author_profile_id uuid;
  target_post_state public.post_state;
  created_comment_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  created_time timestamptz := clock_timestamp();
  parent_parent_id uuid;
BEGIN
  IF request_id IS NULL THEN RAISE EXCEPTION 'request id required' USING ERRCODE='23502'; END IF;
  SELECT p.id INTO operator_id
  FROM public.profiles p JOIN public.profile_roles pr ON pr.profile_id=p.id
  WHERE p.account_kind='human' AND p.auth_subject=app.current_auth_subject()
    AND pr.role='operator' AND pr.revoked_at IS NULL
  FOR UPDATE OF p, pr;
  IF operator_id IS NULL THEN RAISE EXCEPTION 'active human operator required' USING ERRCODE='42501'; END IF;

  -- Lock the post first for the global order, but retain the existing error
  -- precedence by validating the represented IP before rejecting saved state.
  SELECT target.author_profile_id,target.state
  INTO target_author_profile_id,target_post_state
  FROM public.posts target
  WHERE target.id=target_post_id
  FOR UPDATE OF target;
  IF target_author_profile_id IS NULL THEN
    RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002';
  END IF;

  PERFORM 1
  FROM public.ip_profiles ip
  JOIN public.ip_identity_revisions r
    ON r.id=ip.current_identity_revision_id AND r.ip_profile_id=ip.profile_id
  WHERE ip.profile_id IN (target_author_profile_id, represented_ip_profile_id)
  ORDER BY ip.profile_id
  FOR UPDATE OF ip, r;

  IF NOT EXISTS (
    SELECT 1 FROM public.ip_profiles ip
    WHERE ip.profile_id=target_author_profile_id AND ip.public_state='published'
  ) THEN RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ip_profiles ip
    WHERE ip.profile_id=represented_ip_profile_id AND ip.public_state='published' AND ip.operation_enabled
  ) THEN RAISE EXCEPTION 'IP not publishable' USING ERRCODE='P0001'; END IF;
  IF target_post_state<>'published' THEN
    RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002';
  END IF;

  IF requested_parent_comment_id IS NOT NULL THEN
    SELECT parent.parent_comment_id INTO parent_parent_id
    FROM public.comments parent
    WHERE parent.id=requested_parent_comment_id AND parent.post_id=target_post_id AND parent.state='published'
    FOR UPDATE OF parent;
    IF NOT FOUND OR parent_parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid comment thread' USING ERRCODE='23514';
    END IF;
  END IF;

  INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,acting_operator_profile_id,source,body,state,created_at)
  VALUES(created_comment_id,target_post_id,requested_parent_comment_id,represented_ip_profile_id,operator_id,'admin',requested_body,'published',created_time);

  INSERT INTO public.audit_events(id,actor_type,actor_profile_id,action,entity_type,entity_id,request_id,source_app,result,change_summary)
  VALUES(gen_random_uuid(),'operator',operator_id,'ip_comment_published','comment',created_comment_id,request_id,'admin','succeeded',jsonb_build_object('source','admin','represented_ip_profile_id',represented_ip_profile_id));
  INSERT INTO public.workflow_transitions(id,entity_type,entity_id,previous_state,next_state,actor_profile_id,reason_code,request_id)
  VALUES(gen_random_uuid(),'comment',created_comment_id,NULL,'published',operator_id,'admin_publish',request_id);
  INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties)
  VALUES(event_id,'ip_comment_published',1,operator_id,'comment',created_comment_id,request_id,'admin',jsonb_build_object('event_id',event_id,'request_id',request_id,'ip_profile_id',represented_ip_profile_id,'post_id',target_post_id,'action_source','admin'));
  INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload)
  VALUES(gen_random_uuid(),event_id,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','ip_comment_published','event_version',1,'request_id',request_id,'ip_profile_id',represented_ip_profile_id,'post_id',target_post_id,'action_source','admin'));

  RETURN QUERY
  SELECT c.id,c.post_id,c.parent_comment_id,c.body,c.created_at,profile.id,profile.username,r.display_name,r.bio,r.languages
  FROM public.comments c
  JOIN public.profiles profile ON profile.id=c.author_profile_id
  JOIN public.ip_profiles ip ON ip.profile_id=profile.id
  JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id
  WHERE c.id=created_comment_id;
END
$$;
REVOKE ALL ON FUNCTION public.platform_publish_ip_comment(uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_publish_ip_comment(uuid,uuid,text,uuid,uuid) TO aifans_platform;

DROP FUNCTION public.social_public_search_posts(text,timestamptz,uuid,integer);
DROP FUNCTION public.social_post_metrics(uuid,uuid,text);
CREATE FUNCTION public.social_post_metrics(target_post_id uuid,target_author_id uuid,requested_locale text)
RETURNS TABLE(score numeric,like_count integer,comment_count integer,bookmark_count integer,share_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    (round(extract(epoch FROM post.published_at) / 3600, 6)
      + ip.feed_weight
      + CASE WHEN EXISTS (SELECT 1 FROM public.follows follow WHERE follow.follower_profile_id=public.social_current_human_profile_id() AND follow.followed_profile_id=post.author_profile_id) THEN 100 ELSE 0 END
      + CASE WHEN requested_locale IS NOT NULL AND post.language_code=requested_locale THEN 10 ELSE 0 END
      + 2 * (SELECT count(*) FROM public.post_likes post_like WHERE post_like.post_id=post.id)
      + 3 * (SELECT count(*) FROM public.comments comment WHERE comment.post_id=post.id AND comment.state='published'))::numeric,
    (SELECT count(*) FROM public.post_likes post_like WHERE post_like.post_id=post.id)::integer,
    (SELECT count(*) FROM public.comments comment WHERE comment.post_id=post.id AND comment.state='published')::integer,
    (SELECT count(*) FROM public.bookmarks bookmark WHERE bookmark.post_id=post.id)::integer,
    (SELECT count(*) FROM public.post_share_events share_event WHERE share_event.post_id=post.id)::integer
  FROM public.posts post
  JOIN public.ip_profiles ip ON ip.profile_id=post.author_profile_id
  JOIN public.ip_identity_revisions revision ON revision.id=ip.current_identity_revision_id AND revision.ip_profile_id=ip.profile_id
  WHERE post.id=target_post_id AND post.author_profile_id=target_author_id AND post.state='published' AND ip.public_state='published'
$$;
REVOKE ALL ON FUNCTION public.social_post_metrics(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_post_metrics(uuid,uuid,text) TO aifans_anon,aifans_authenticated;

CREATE FUNCTION public.social_public_search_posts(search_query text,after_published_at timestamptz,after_id uuid,page_limit integer)
RETURNS TABLE(
  post_id uuid,author_profile_id uuid,body text,language_code text,published_at timestamptz,
  id uuid,username text,display_name text,bio text,languages text[],visual_type public.creator_visual_type,
  creator_id uuid,creator_username text,creator_display_name text,
  like_count integer,comment_count integer,bookmark_count integer,share_count integer,
  viewer_has_liked boolean,viewer_has_bookmarked boolean,viewer_follows_author boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH escaped AS (
    SELECT replace(replace(replace(coalesce(search_query,''),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_') AS q
  )
  SELECT p.post_id,p.author_profile_id,p.body,p.language_code,p.published_at,
    p.id,p.username,p.display_name,p.bio,p.languages,p.visual_type,
    p.creator_id,p.creator_username,p.creator_display_name,
    metrics.like_count,metrics.comment_count,metrics.bookmark_count,metrics.share_count,
    flags.viewer_has_liked,flags.viewer_has_bookmarked,flags.viewer_follows_author
  FROM public.social_public_posts() p
  CROSS JOIN escaped
  CROSS JOIN LATERAL public.social_viewer_flags(p.post_id,p.id) flags
  CROSS JOIN LATERAL public.social_post_metrics(p.post_id,p.id,NULL::text) metrics
  WHERE (p.body ILIKE '%'||escaped.q||'%' ESCAPE chr(92)
    OR p.username ILIKE '%'||escaped.q||'%' ESCAPE chr(92)
    OR p.display_name ILIKE '%'||escaped.q||'%' ESCAPE chr(92))
    AND (after_id IS NULL OR (p.published_at,p.post_id)<(after_published_at,after_id))
  ORDER BY p.published_at DESC,p.post_id DESC
  LIMIT LEAST(GREATEST(page_limit,1),51)
$$;
REVOKE ALL ON FUNCTION public.social_public_search_posts(text,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_public_search_posts(text,timestamptz,uuid,integer) TO aifans_anon,aifans_authenticated;
```

The score expression intentionally contains only the existing time, feed weight, follow, locale, like, and comment terms. Bookmark/share totals are display metrics, not ranking inputs.

- [ ] **Step 2: Add Drizzle schema parity and export it**

Add after `bookmarks` in `packages/db/src/schema.ts`:

```ts
export const postShareEvents = pgTable(
  'post_share_events',
  {
    id: uuid().primaryKey(),
    postId: uuid('post_id').notNull().references(() => posts.id),
    actorProfileId: uuid('actor_profile_id').references(() => profiles.id),
    idempotencyKey: uuid('idempotency_key').notNull(),
    createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
  },
  (table) => [
    unique('post_share_events_post_id_idempotency_key_unique').on(table.postId, table.idempotencyKey),
    index('post_share_events_post_created_idx').on(table.postId, table.createdAt.desc()),
  ],
)
```

Add `postShareEvents` next to `bookmarks` in the schema export list in `packages/db/src/index.ts`.

- [ ] **Step 3: Extend the repository row mapper and command**

Apply these exact shape changes in `packages/db/src/social.ts`:

```ts
// SocialRepository
recordPostShare(viewer: Actor | null, postId: string, idempotencyKey: string): Promise<{created: boolean}>

// PostRow
bookmark_count: number | string
share_count: number | string

// publicPostSql metric selection
metrics.like_count, metrics.comment_count, metrics.bookmark_count, metrics.share_count,

// post(row)
bookmarkCount: Number(row.bookmark_count),
shareCount: Number(row.share_count),
```

Add this repository member after `unbookmarkPost`:

```ts
recordPostShare: (viewer, postId, idempotencyKey) =>
  read(viewer, async (client) => ({
    created: (await client.query<{created: boolean}>(
      'SELECT public.record_post_share($1,$2) AS created',
      [postId, idempotencyKey],
    )).rows[0]?.created === true,
  })),
```

Do not widen `platform_publish_post`: both overloads still return only `like_count` and `comment_count`. Replace the current alias with a legacy row type that omits only the two new columns, then adapt the freshly inserted post at the single platform boundary. Zero is authoritative here because no other transaction can create a bookmark/share relationship for the new post before the publishing transaction returns it:

```ts
type PlatformPostRow = Omit<PostRow, 'bookmark_count' | 'share_count'>

// createPlatformSocialRepository.publishPost, immediately before post(...)
return FeedPostSchema.parse(
  post(
    {...created, bookmark_count: 0, share_count: 0},
    await publicMedia(client, created.post_id, publicMediaBaseUrl),
  ),
)
```

This is an explicit producer adapter, not a fallback in `post()`: every other `PostRow` remains required to contain both aggregate columns.

- [ ] **Step 4: Update database row fixtures and assertions**

In each `PostRow` fixture in `packages/db/tests/social-feed-projection.unit.test.ts`, add:

```ts
bookmark_count: 0,
share_count: 0,
```

Then assert every mapped item contains `{bookmarkCount: 0, shareCount: 0}`. In the published-post expectation in `packages/db/tests/platform-social.test.ts`, add:

```ts
bookmarkCount: 0,
shareCount: 0,
```

Keep the platform SQL fixture/mocks on the legacy two-count row and add a focused assertion that `publishPost` succeeds through the adapter and returns both new values as numeric zero. This guards against accidentally changing either `platform_publish_post` database signature while making `PostRow` strict.

The existing platform-command source assertion currently encodes the superseded IP-before-post order. Reverse it so it proves the post lock occurs before the sorted IP lock, while retaining the operator, parent, and `FOR UPDATE OF ip, r` assertions:

```ts
const commentDefinition = byName.get('platform_publish_ip_comment') ?? ''
expect(commentDefinition.indexOf('FOR UPDATE OF target')).toBeLessThan(
  commentDefinition.indexOf('ORDER BY ip.profile_id'),
)
```

Add a platform integration matrix that calls the command as a valid operator and asserts the preserved combined-error precedence with no inserted comment, audit, workflow, business-event, or outbox row:

```ts
// Existing target row, hidden target-author IP, invalid represented IP: target P0002 wins.
await expect(publishComment({postId: hiddenAuthorPost, representedIpId: invalidRepresented})).rejects.toMatchObject({code:'P0002'})
// Existing withdrawn target with otherwise visible author, invalid represented IP: represented P0001 wins before saved post state.
await expect(publishComment({postId: withdrawnPost, representedIpId: invalidRepresented})).rejects.toMatchObject({code:'P0001'})
// Same withdrawn target with a valid represented IP: delayed saved-state validation returns P0002.
await expect(publishComment({postId: withdrawnPost, representedIpId: validRepresented})).rejects.toMatchObject({code:'P0002'})
// Missing target cannot supply an author and remains P0002 even when represented IP is invalid.
await expect(publishComment({postId: randomUUID(), representedIpId: invalidRepresented})).rejects.toMatchObject({code:'P0002'})
```

Also assert `pg_get_functiondef` places the unfiltered `WHERE target.id=target_post_id ... FOR UPDATE OF target` before the sorted IP lock, the represented-IP `P0001` check before `IF target_post_state<>'published'`, and all mutation statements after both checks. Do not filter `target.state='published'` in the first locked query; that would silently change the second case from `P0001` to `P0002`.

- [ ] **Step 5: Continue directly to Part B without an intermediate gate or commit**

At this point the database projection and `PostRow` have the new fields while `FeedPostSchema` and many fixtures do not. Preserve the working tree and continue immediately; the only GREEN/commit checkpoint for Task 2 is Part B Step 5/6 below.

#### Part B: Make both counts mandatory in the shared contract and every fixture

**Files:**
- Modify: `packages/contracts/src/social.ts:308-320,447-480`
- Modify: `packages/contracts/src/social.test.ts:153-290`
- Modify: `apps/web/src/lib/social-api.test.tsx`
- Modify: `apps/web/src/lib/social-cache.test.tsx`
- Modify: `apps/web/src/components/social/SocialContent.test.tsx`
- Modify: `apps/web/src/components/profile/MyProfileTabs.test.tsx`
- Modify: `apps/web/src/components/social/PublicProfileContent.test.tsx`
- Modify: `apps/web/src/components/social/search-ranking.test.ts`
- Modify: `apps/web/src/app/[locale]/posts/[postId]/page.test.tsx`
- Modify: `apps/web/src/app/[locale]/search/page.test.tsx`
- Modify: `apps/web/src/components/admin/AdminConsole.test.tsx`
- Modify: `apps/web/src/components/social/PostCard.test.tsx`
- Modify: `packages/db/tests/social-search.test.ts`
- Modify: `apps/api/src/routes/social.test.ts:34-43`
- Modify: `apps/api/src/routes/admin.test.ts:52-60`

- [ ] **Step 1: Add failing strict-contract tests**

Define one valid post fixture in `packages/contracts/src/social.test.ts` with all four counts and add these assertions:

```ts
const strictPost = {
  id,
  body: 'Hello',
  languageCode: 'en',
  publishedAt: timestamp,
  author: ip,
  likeCount: 0,
  commentCount: 0,
  bookmarkCount: 0,
  shareCount: 0,
}
expect(FeedPostSchema.parse(strictPost)).toEqual(strictPost)
expect(() => FeedPostSchema.parse({...strictPost, bookmarkCount: undefined})).toThrow()
expect(() => FeedPostSchema.parse({...strictPost, shareCount: undefined})).toThrow()
expect(() => FeedPostSchema.parse({...strictPost, bookmarkCount: -1})).toThrow()
expect(() => FeedPostSchema.parse({...strictPost, shareCount: 1.5})).toThrow()
```

Also add strict response coverage:

```ts
expect(ShareRecordedSchema.parse({created: true})).toEqual({created: true})
expect(() => ShareRecordedSchema.parse({created: true, shareCount: 10})).toThrow()
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir packages/contracts test -- social.test.ts
```

Expected: FAIL because missing bookmark/share counts are still accepted and `ShareRecordedSchema` is not exported.

- [ ] **Step 3: Implement the strict schemas**

Update `FeedPostSchema` and add the response schema in `packages/contracts/src/social.ts`:

```ts
export const FeedPostSchema = z.strictObject({
  id: uuid,
  body: z.string().max(5000),
  languageCode: z.string().nullable(),
  publishedAt: dateTime,
  author: PublicIpSchema,
  media: z.array(PublicPostMediaSchema).max(4).optional(),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  bookmarkCount: z.number().int().nonnegative(),
  shareCount: z.number().int().nonnegative(),
  viewerHasLiked: z.boolean().optional(),
  viewerHasBookmarked: z.boolean().optional(),
  viewerFollowsAuthor: z.boolean().optional(),
})
export const ShareRecordedSchema = z.strictObject({created: z.boolean()})
export type ShareRecorded = z.infer<typeof ShareRecordedSchema>
```

- [ ] **Step 4: Update every strict post fixture explicitly**

Add these properties beside `likeCount` and `commentCount` in each post literal in the following files:

```ts
bookmarkCount: 0,
shareCount: 0,
```

Files requiring zero-valued fixtures:

```text
apps/api/src/routes/admin.test.ts
apps/api/src/routes/social.test.ts
apps/web/src/app/[locale]/posts/[postId]/page.test.tsx
apps/web/src/app/[locale]/search/page.test.tsx
apps/web/src/components/admin/AdminConsole.test.tsx
apps/web/src/components/profile/MyProfileTabs.test.tsx
apps/web/src/components/social/PublicProfileContent.test.tsx
apps/web/src/components/social/search-ranking.test.ts
packages/db/tests/social-search.test.ts
```

Use the existing nonzero fixture values in these files and add deterministic totals:

```ts
// apps/web/src/lib/social-api.test.tsx
bookmarkCount: 1,
shareCount: 3,

// apps/web/src/lib/social-cache.test.tsx
bookmarkCount: 1,
shareCount: 3,

// apps/web/src/components/social/SocialContent.test.tsx
bookmarkCount: 1,
shareCount: 3,

// apps/web/src/components/social/PostCard.test.tsx
bookmarkCount: 1,
shareCount: 3,
```

Do not update the creator analytics DTO files identified in the file map.

- [ ] **Step 5: Apply the migration and verify the entire atomic batch GREEN**

Run:

```bash
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm db:migrate
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir packages/db test -- social-repository.test.ts social-search.test.ts social-feed-projection.unit.test.ts platform-social.test.ts
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir packages/contracts test -- social.test.ts
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm typecheck
```

Expected: migration output includes `202609030002_interaction_counts.sql`; all database and contract tests PASS, followed by a clean workspace typecheck. The creator-without-active-revision test returns `P0002` with no ledger row; combined platform errors preserve their prior precedence; both bounded share/comment probes terminate without `40P01`; platform publish returns strict zero bookmark/share counts through its explicit adapter. Any remaining type error about missing `bookmarkCount` or `shareCount` identifies an unlisted strict producer/fixture; add both required numeric properties at that construction point rather than weakening the schema.

- [ ] **Step 6: Commit the database and strict-contract batch together**

```bash
git add packages/db/migrations/202609030002_interaction_counts.sql packages/db/src/schema.ts packages/db/src/index.ts packages/db/src/social.ts packages/db/tests/social-repository.test.ts packages/db/tests/social-search.test.ts packages/db/tests/social-feed-projection.unit.test.ts packages/db/tests/platform-social.test.ts packages/contracts/src/social.ts packages/contracts/src/social.test.ts apps/api/src/routes/admin.test.ts apps/api/src/routes/social.test.ts apps/web/src/app/'[locale]'/posts/'[postId]'/page.test.tsx apps/web/src/app/'[locale]'/search/page.test.tsx apps/web/src/components/admin/AdminConsole.test.tsx apps/web/src/components/profile/MyProfileTabs.test.tsx apps/web/src/components/social/PublicProfileContent.test.tsx apps/web/src/components/social/SocialContent.test.tsx apps/web/src/components/social/PostCard.test.tsx apps/web/src/components/social/search-ranking.test.ts apps/web/src/lib/social-api.test.tsx apps/web/src/lib/social-cache.test.tsx
git commit -m "feat(social): add strict durable interaction counts"
```

### Task 3: Add the optional-auth share API and abuse controls

**Depends on:** the complete atomic Task 2 commit, including `ShareRecordedSchema` and the repository port implementation.

**Files:**
- Modify: `apps/api/src/ports/social.ts:22-50`
- Modify: `apps/api/src/routes/social.ts:1-47,327-358`
- Modify: `apps/api/src/routes/social.test.ts`
- Modify: `apps/api/src/middleware/rate-limit.ts:7-15`
- Modify: `apps/api/src/hardening.test.ts:20-34`

- [ ] **Step 1: Add failing API tests for the complete route contract**

Add `vi` to the Vitest import, add `recordPostShare: async () => ({created: true})` to the `socialPort` fixture, and add tests proving:

```ts
it('records a share with optional auth and a validated idempotency key', async () => {
  for (const auth of [validAuth, missingAuth]) {
    const calls: unknown[] = []
    const idempotencyKey = randomUUID()
    const social = socialPort({recordPostShare: async (viewer, target, key) => {
      calls.push([viewer, target, key])
      return {created: true}
    }})
    const response = await createApp({auth, profiles: profilePort(), social}).request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'idempotency-key': idempotencyKey}})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({created: true})
    expect(calls).toEqual([[
      auth === validAuth ? {subject: identity.subject} : null,
      postId,
      idempotencyKey,
    ]])
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  }
})

it('accepts strict empty JSON with an exact JSON media type when a body stream is present', async () => {
  const idempotencyKey = randomUUID()
  for (const contentType of ['application/json', 'application/json; charset=utf-8']) {
    const response = await createApp({auth: missingAuth, profiles: profilePort(), social: socialPort()}).request(`/v1/posts/${postId}/share`, {
      method: 'POST',
      headers: {'content-type': contentType, 'idempotency-key': idempotencyKey},
      body: '{}',
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({created:true})
  }
})

it('rejects missing or invalid idempotency keys, ids, query, content type, and nonempty bodies before the port', async () => {
  const recordPostShare = vi.fn(async () => ({created: true}))
  const app = createApp({auth: missingAuth, profiles: profilePort(), social: socialPort({recordPostShare})})
  const key = randomUUID()
  expect((await app.request(`/v1/posts/${postId}/share`, {method: 'POST'})).status).toBe(400)
  expect((await app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'idempotency-key': 'not-a-uuid'}})).status).toBe(400)
  expect((await app.request('/v1/posts/not-a-uuid/share', {method: 'POST', headers: {'idempotency-key': key}})).status).toBe(400)
  expect((await app.request(`/v1/posts/${postId}/share?count=1`, {method: 'POST', headers: {'idempotency-key': key}})).status).toBe(400)
  expect((await app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'text/plain', 'idempotency-key': key}, body: '{}'})).status).toBe(400)
  expect((await app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'text/plain', 'idempotency-key': key}, body: '   '})).status).toBe(400)
  expect((await app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'text/plain', 'idempotency-key': key}, body: ''})).status).toBe(400)
  expect((await app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'application/jsonx', 'idempotency-key': key}, body: '{}'})).status).toBe(400)
  expect((await app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'application/jsonp', 'idempotency-key': key}, body: '{}'})).status).toBe(400)
  expect((await app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'application/json', 'idempotency-key': key}, body: '{"count":1}'})).status).toBe(400)
  expect((await app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'application/json', 'idempotency-key': key}, body: 'x'.repeat(65_537)})).status).toBe(413)
  expect(recordPostShare).not.toHaveBeenCalled()
})
```

Add these concrete error-boundary tests:

```ts
it('keeps share authentication and not-found semantics strict', async () => {
  const invalidAuth = {verify: async () => ({status: 'invalid'} as const)} satisfies AuthVerifier
  const headers = {'idempotency-key': randomUUID()}
  await expectError(await createApp({auth: invalidAuth, profiles: profilePort(), social: socialPort()}).request(`/v1/posts/${postId}/share`, {method: 'POST', headers}), 401, 'AUTH_INVALID')
  await expectError(await createApp({auth: missingAuth, profiles: profilePort(), social: socialPort({recordPostShare: async () => {throw Object.assign(new Error('hidden'), {code: 'P0002'})}})}).request(`/v1/posts/${postId}/share`, {method: 'POST', headers}), 404, 'POST_NOT_FOUND')
})

it('redacts invalid share responses and database constraint details', async () => {
  const diagnostics: unknown[] = []
  const expanded = await createApp({
    auth: missingAuth,
    profiles: profilePort(),
    social: socialPort({recordPostShare: async () => ({created: true, internal: 'secret'})}),
  }).request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'idempotency-key': randomUUID()}})
  await expectError(expanded, 500, 'INTERNAL_ERROR')
  const constrained = await createApp({
    auth: missingAuth,
    profiles: profilePort(),
    social: socialPort({recordPostShare: async () => {throw {name: 'DatabaseError', code: '23505', detail: 'secret constraint'}}}),
    onUnhandledError: (diagnostic) => diagnostics.push(diagnostic),
  }).request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'idempotency-key': randomUUID()}})
  const constrainedBody = await constrained.clone().text()
  await expectError(constrained, 500, 'INTERNAL_ERROR')
  expect(constrainedBody).not.toContain('secret constraint')
  expect(diagnostics).toEqual([{name: 'DatabaseError', code: '23505'}])
})
```

- [ ] **Step 2: Run API route/hardening tests and verify RED**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/api test -- src/routes/social.test.ts src/hardening.test.ts
```

Expected: FAIL because the port member, route, and rate-limit mapping are absent.

- [ ] **Step 3: Extend the API port and route**

Add to `SocialPort`:

```ts
recordPostShare(viewer: Actor | null, postId: string, idempotencyKey: string): Promise<{created: boolean}>
```

Import `ShareRecordedSchema` in `apps/api/src/routes/social.ts`. Keep the existing `parseEmptyBody` for existing relationship commands and add these share-specific helpers; the global 65,536-byte middleware remains the hard payload bound. Checking `c.req.raw.body === null` distinguishes a genuinely absent stream from an explicitly supplied empty stream. The media-type parser compares the essence exactly and permits only an optional valid UTF-8 charset parameter:

```ts
function isJsonMediaType(value: string | undefined): boolean {
  if (!value) return false
  const [rawEssence, ...rawParameters] = value.split(';')
  if (rawEssence.trim().toLowerCase() !== 'application/json') return false
  if (rawParameters.length > 1) return false
  return rawParameters.every((parameter) => {
    const match = /^\s*charset\s*=\s*(?:"utf-8"|utf-8)\s*$/i.exec(parameter)
    return match !== null
  })
}

async function parseShareBody(c: ApiContext): Promise<boolean> {
  if (c.req.raw.body === null) return true
  if (!isJsonMediaType(c.req.header('content-type'))) return false
  const text = await c.req.text()
  if (!text.trim()) return true
  try {
    return EmptyBodySchema.safeParse(JSON.parse(text)).success
  } catch {
    return false
  }
}
```

Register the route before the authenticated relationship helper:

```ts
app.post('/v1/posts/:postId/share', async (c) => {
  const unavailable = socialUnavailable(c, dependencies.social)
  if (unavailable) return unavailable
  const query = safeQuery(c)
  const postId = parseId(c.req.param('postId'))
  const idempotencyKey = parseId(c.req.header('idempotency-key'))
  if (query === null || !EmptyQuerySchema.safeParse(query).success || !postId || !idempotencyKey || !(await parseShareBody(c))) return invalidRequest(c)
  const viewer = await resolveActor(c, dependencies, false)
  if (!viewer.ok) return viewer.response
  try {
    return c.json(ShareRecordedSchema.parse(
      await dependencies.social!.recordPostShare(viewer.actor, postId, idempotencyKey),
    ), 200)
  } catch (error) {
    return knownSocialError(c, error, {notFound: 'POST_NOT_FOUND'})
  }
})
```

This route accepts an absent body or `{}` only; it never accepts actor, count, URL, destination, IP, or browser metadata.

- [ ] **Step 4: Rate-limit anonymous and authenticated share requests**

Add this branch in `policyFor` before the existing comment branch:

```ts
if (method === 'POST' && /^\/v1\/posts\/[^/]+\/share$/.test(path)) return 'social_mutation'
```

Add a hardening assertion that a request with both a valid UUID `Idempotency-Key` and signed rate-limit identity reaches `consume({policy:'social_mutation', ...})` for `POST /v1/posts/:id/share`, that a missing/forged rate-limit identity fails closed when required, and that serialized calls contain neither the raw forwarded IP nor body data. The idempotency key may appear only in the route-port assertion, never as the rate-limit identifier.

- [ ] **Step 5: Run API tests and typecheck and verify GREEN**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/api test -- src/routes/social.test.ts src/hardening.test.ts
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/api typecheck
```

Expected: PASS for anonymous/authenticated success, all invalid inputs, fixed rate-limit policy, strict output, not-found semantics, and normal error redaction.

- [ ] **Step 6: Commit the API slice**

```bash
git add apps/api/src/ports/social.ts apps/api/src/routes/social.ts apps/api/src/routes/social.test.ts apps/api/src/middleware/rate-limit.ts apps/api/src/hardening.test.ts
git commit -m "feat(api): record optional-actor post shares"
```

### Task 4: Allow the share command through the same-origin Web BFF

**Depends on:** Task 3's strict API endpoint and Task 2's response schema.

**Files:**
- Modify: `apps/web/src/app/api/social/[...path]/route.ts:1-116`
- Modify: `apps/web/src/app/api/social/[...path]/route.test.tsx:30-109`
- Modify: `apps/web/src/lib/server-api.ts`
- Modify: `apps/web/src/lib/server-api.test.tsx`
- Modify: `apps/web/src/lib/social-invalidation.ts`
- Modify: `apps/web/src/lib/social-invalidation.test.ts`

- [ ] **Step 1: Add failing BFF tests**

Change the route-test auth mock to a controllable hoisted function so the same suite can prove both authenticated and anonymous transport:

```ts
const {getApiBearerToken, revalidateTag} = vi.hoisted(() => ({
  getApiBearerToken: vi.fn(async (): Promise<string | null> => 'signed-jwt'),
  revalidateTag: vi.fn(),
}))
vi.mock('../../../../lib/auth/server.js', () => ({getApiBearerToken}))
```

Reset it to the authenticated default in `afterEach`:

```ts
getApiBearerToken.mockReset()
getApiBearerToken.mockResolvedValue('signed-jwt')
```

Add a test that invokes `POST` with both an absent body and `{}` and verifies the exact upstream request:

```ts
it('proxies only same-origin empty share POSTs with strict private responses and one trusted key', async () => {
  process.env.AIFANS_API_URL = 'https://internal-api.example'
  process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET = 's'.repeat(32)
  const upstream = vi.fn()
    .mockResolvedValueOnce(Response.json({created: true}, {status: 200, headers: {'x-request-id': 'upstream-id-1'}}))
    .mockResolvedValueOnce(Response.json({created: false}, {status: 200, headers: {'x-request-id': 'upstream-id-2'}}))
    .mockResolvedValueOnce(Response.json({created: false}, {status: 200, headers: {'x-request-id': 'upstream-id-3'}}))
  vi.stubGlobal('fetch', upstream)
  const path = ['posts', '22222222-2222-4222-8222-222222222222', 'share']
  const idempotencyKey = '33333333-3333-4333-8333-333333333333'
  for (const [index, [body, contentType]] of [
    [undefined, undefined],
    ['{}', 'application/json'],
    ['{}', 'application/json; charset=utf-8'],
  ].entries()) {
    const headers = new Headers({origin: 'https://web.example', 'idempotency-key': idempotencyKey, 'x-vercel-forwarded-for': '203.0.113.7', authorization: 'Bearer forged', 'x-aifans-rate-limit-identity': 'forged'})
    if (contentType !== undefined) headers.set('content-type', contentType)
    const response = await POST(new Request(`https://web.example/api/social/${path.join('/')}`, {method: 'POST', headers, ...(body === undefined ? {} : {body})}), {params: Promise.resolve({path})})
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({created: index === 0})
  }
  for (const [, init] of upstream.mock.calls) {
    const sent = new Headers((init as RequestInit).headers)
    expect((init as RequestInit).body).toBeUndefined()
    expect(sent.has('content-type')).toBe(false)
    expect(sent.get('authorization')).toBe('Bearer signed-jwt')
    expect(sent.get('idempotency-key')).toBe(idempotencyKey)
    expect(sent.get('x-aifans-rate-limit-identity')).toMatch(/^v1\./)
    expect(sent.has('cookie')).toBe(false)
    expect(sent.has('x-vercel-forwarded-for')).toBe(false)
  }
})
```

Add an explicit token-`null` request. Anonymous success must not synthesize bearer authentication, but it still uses the trusted signed rate-limit identity:

```ts
it('proxies an anonymous share without Authorization and retains signed rate-limit enforcement', async () => {
  process.env.AIFANS_API_URL = 'https://internal-api.example'
  process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET = 's'.repeat(32)
  getApiBearerToken.mockResolvedValueOnce(null)
  const upstream = vi.fn().mockResolvedValue(Response.json({created: true}))
  vi.stubGlobal('fetch', upstream)
  const path = ['posts', postId, 'share']
  const response = await POST(new Request(`https://web.example/api/social/${path.join('/')}`, {
    method: 'POST',
    headers: {origin: 'https://web.example', 'idempotency-key': postId, 'x-vercel-forwarded-for': '203.0.113.7'},
  }), {params: Promise.resolve({path})})

  expect(response.status).toBe(200)
  const sent = new Headers((upstream.mock.calls[0]?.[1] as RequestInit).headers)
  expect(sent.has('authorization')).toBe(false)
  expect(sent.get('x-aifans-rate-limit-identity')).toMatch(/^v1\./)
})
```

Add these table/error cases after the success test:

```ts
it.each([
  [new Request(`https://web.example/api/social/posts/${postId}/share`, {method: 'POST', headers: {origin: 'https://evil.example', 'idempotency-key': postId}}), 403],
  [new Request(`https://web.example/api/social/posts/${postId}/share`, {method: 'POST', headers: {origin: 'https://web.example'}}), 400],
  [new Request(`https://web.example/api/social/posts/${postId}/share`, {method: 'POST', headers: {origin: 'https://web.example', 'idempotency-key': 'invalid'}}), 400],
  [new Request(`https://web.example/api/social/posts/${postId}/share?count=1`, {method: 'POST', headers: {origin: 'https://web.example', 'idempotency-key': postId}}), 400],
  [new Request(`https://web.example/api/social/posts/${postId}/share`, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/json', 'idempotency-key': postId}, body: '{"count":1}'}), 422],
  [new Request(`https://web.example/api/social/posts/${postId}/share`, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'text/plain', 'idempotency-key': postId}, body: '{}'}), 422],
  [new Request(`https://web.example/api/social/posts/${postId}/share`, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'text/plain', 'idempotency-key': postId}, body: '   '}), 422],
  [new Request(`https://web.example/api/social/posts/${postId}/share`, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'text/plain', 'idempotency-key': postId}, body: ''}), 422],
  [new Request(`https://web.example/api/social/posts/${postId}/share`, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/jsonx', 'idempotency-key': postId}, body: '{}'}), 422],
  [new Request(`https://web.example/api/social/posts/${postId}/share`, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/jsonp', 'idempotency-key': postId}, body: '{}'}), 422],
  [new Request(`https://web.example/api/social/posts/${postId}/share`, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/json', 'content-length': '8193', 'idempotency-key': postId}, body: '{}'}), 413],
  [new Request(`https://web.example/api/social/posts/${postId}/share`, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/json', 'idempotency-key': postId}, body: 'x'.repeat(8193)}), 413],
] as const)('rejects an invalid share proxy request before transport', async (request, status) => {
  process.env.AIFANS_API_URL = 'https://internal-api.example'
  const upstream = vi.fn()
  vi.stubGlobal('fetch', upstream)
  const response = await POST(request, {params: Promise.resolve({path: ['posts', postId, 'share']})})
  expect(response.status).toBe(status)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(upstream).not.toHaveBeenCalled()
})

it.each([
  [201, {created: true}],
  [200, {created: 'yes'}],
  [200, {created: true, internal: 'secret'}],
] as const)('redacts invalid successful share responses', async (status, payload) => {
  process.env.AIFANS_API_URL = 'https://internal-api.example'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload, {status})))
  const path = ['posts', postId, 'share']
  const response = await POST(new Request(`https://web.example/api/social/${path.join('/')}`, {method: 'POST', headers: {origin: 'https://web.example', 'idempotency-key': postId}}), {params: Promise.resolve({path})})
  expect(response.status).toBe(502)
  expect(await response.json()).toEqual({code: 'SOCIAL_INVALID_RESPONSE'})
  expect(revalidateTag).not.toHaveBeenCalled()
})
```

Define `const postId = '22222222-2222-4222-8222-222222222222'` once at the top of the describe block. Add a wrong-path assertion with `POST .../profiles/:id/share` returning `404`, `cache-control: private, no-store`, and no upstream call. In the declared-length case, also assert `getApiBearerToken` was not called; the 8193-byte header must fail before token acquisition as well as before `fetch`.

- [ ] **Step 2: Run BFF/invalidation tests and verify RED**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web test -- src/app/api/social/'[...path]'/route.test.tsx src/lib/server-api.test.tsx src/lib/social-invalidation.test.ts
```

Expected: FAIL because POST currently allows comments only, has no trusted idempotency-key path, and applies the comment body/status contract to every POST.

- [ ] **Step 3: Split share POST validation from comment POST validation**

Import `ShareRecordedSchema`; allow `posts/:uuid/share` only for POST:

```ts
if (method === 'POST' && parts[0] === 'posts' && (parts[2] === 'comments' || parts[2] === 'share')) return parts.join('/')
```

Inside `proxy`, derive `const shareRequest = method === 'POST' && /\/share$/.test(path)`. Add an equivalent local `isJsonMediaType` helper with the exact implementation shown in the API step; do not import across applications. Before reading a share body, require `request.headers.get('idempotency-key')` to match the existing UUID expression or return `400 INVALID_REQUEST`. Accept an absent body without a content type. When `request.body !== null`, first require that exact media-type check (`request.headers.get(...) ?? undefined`), then use the existing bounded reader, reject duplicate keys, and require the parsed value to be a non-array object with `Object.keys(value).length === 0`; normalize valid blank content or `{}` to an undefined upstream body. Reject other share bodies with `422 INVALID_REQUEST`, while retaining the bounded comment parser only for non-share POSTs. Use:

```ts
const shareRequest = method === 'POST' && /\/share$/.test(path)
const idempotencyKey = shareRequest ? request.headers.get('idempotency-key') : null
if (shareRequest && (!idempotencyKey || !uuid.test(idempotencyKey))) {
  return Response.json({code:'INVALID_REQUEST'}, {status:400})
}

let body: string | undefined
if (shareRequest && request.body !== null) {
  if (!isJsonMediaType(request.headers.get('content-type') ?? undefined)) {
    return Response.json({code:'INVALID_REQUEST'}, {status:422})
  }
  let text: string
  try {
    text = await readCommentBody(request)
  } catch {
    return Response.json({code:'PAYLOAD_TOO_LARGE'}, {status:413})
  }
  if (text.trim()) {
    if (duplicateTopLevelKey(text)) return Response.json({code:'INVALID_REQUEST'}, {status:422})
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { return Response.json({code:'INVALID_REQUEST'}, {status:422}) }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || Object.keys(parsed).length !== 0) {
      return Response.json({code:'INVALID_REQUEST'}, {status:422})
    }
  }
}

const expectedStatus = shareRequest ? 200 : method === 'POST' ? 201 : 200
```

All locally generated mutation responses use one cache policy, including empty 404s and the outer 503 boundary. Add these helpers and use them for every pre-transport 400/403/413/422, disallowed-path 404, invalid-success 502, and caught 503 returned by `proxy`:

```ts
const privateNoStore = {'cache-control': 'private, no-store'} as const

function localMutationError(code: string, status: number): Response {
  return Response.json({code}, {status, headers: privateNoStore})
}

function localMutationNotFound(): Response {
  return new Response(null, {status: 404, headers: privateNoStore})
}
```

After valid blank JSON or `{}` has been normalized to `body === undefined`, remove the now-inaccurate entity header before calling the transport. This applies even when the browser supplied `application/json; charset=utf-8`:

```ts
const upstreamHeaders = new Headers(request.headers)
if (shareRequest && body === undefined) upstreamHeaders.delete('content-type')
const upstream = await fetchAifansApi(`/v1/${path}`, {
  policy: 'live-no-store',
  requestInit: {method, headers: upstreamHeaders, ...(body === undefined ? {} : {body})},
  trustedClientHeaders: request.headers,
  ...(idempotencyKey === null ? {} : {trustedIdempotencyKey: idempotencyKey}),
})
```

Do not add `idempotency-key` to the generic inbound-header allow-list. Split the existing combined private/live branch of `AifansApiRequestOptions`: keep `trustedIdempotencyKey?: never` on `public-cache` and `private-cache`, and allow `trustedIdempotencyKey?: string` only on `live-no-store`. Validate it against the UUID expression inside `fetchAifansApi`, and pass it separately to `outboundHeaders`:

```ts
export type AifansApiRequestOptions =
  | (SharedRequestOptions & {policy: 'public-cache'; getToken?: never; trustedClientHeaders?: never; trustedIdempotencyKey?: never})
  | (SharedRequestOptions & {policy: 'private-cache'; getToken?: () => Promise<string | null>; trustedClientHeaders?: Headers; trustedIdempotencyKey?: never})
  | (SharedRequestOptions & {policy: 'live-no-store'; getToken?: () => Promise<string | null>; trustedClientHeaders?: Headers; trustedIdempotencyKey?: string})

const idempotencyKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function outboundHeaders(input: HeadersInit | undefined, token: string | null, trustedClientHeaders?: Headers, trustedIdempotencyKey?: string): Headers {
  const incoming = new Headers(input)
  const headers = new Headers()
  for (const name of ['content-type', 'x-request-id']) {
    const value = incoming.get(name)
    if (value) headers.set(name, value)
  }
  if (trustedIdempotencyKey) headers.set('idempotency-key', trustedIdempotencyKey)
  if (token) headers.set('authorization', `Bearer ${token}`)
  const identity = trustedClientHeaders && createRateLimitIdentity(trustedClientHeaders, Date.now(), process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET)
  if (identity) headers.set('x-aifans-rate-limit-identity', identity)
  return headers
}
```

In `fetchAifansApi`, derive and validate the trusted value before the fetch, then pass it to the helper:

```ts
if (options.policy !== 'live-no-store' && 'trustedIdempotencyKey' in options) throw new Error('Trusted idempotency keys require live no-store policy')
const trustedIdempotencyKey = options.policy === 'live-no-store' ? options.trustedIdempotencyKey : undefined
if (trustedIdempotencyKey !== undefined && !idempotencyKeyPattern.test(trustedIdempotencyKey)) throw new Error('Invalid trusted idempotency key')
// ...existing token and timeout flow...
headers: Object.fromEntries(outboundHeaders(requestInit.headers, token, trustedClientHeaders, trustedIdempotencyKey))
```

For a share request, call `fetchAifansApi` with `trustedIdempotencyKey: idempotencyKey`; never depend on `requestInit.headers` to forward it. Add a `server-api.test.tsx` case in which `requestInit.headers` contains a forged key but `trustedIdempotencyKey` contains a different valid UUID, and assert only the trusted UUID reaches the fetcher. Assert an invalid trusted value rejects before fetch.

Add the response branch at the start of `mutationResponse`:

```ts
if (method === 'POST' && /\/share$/.test(path)) {
  const parsed = ShareRecordedSchema.safeParse(body)
  return parsed.success ? parsed.data : null
}
```

Keep `fetchAifansApi(..., {policy:'live-no-store', trustedClientHeaders: request.headers, trustedIdempotencyKey: idempotencyKey})`; it strips browser authorization/cookie/forwarding headers, forwards only the separately validated idempotency key, supplies the server token when a session exists, and creates the signed ephemeral rate-limit identity without persisting it.

- [ ] **Step 4: Invalidate cached public counts**

Replace `postMutation` logic with an explicit count-affecting set:

```ts
const publicCountMutation = /^posts\/[0-9a-f-]+\/(comments|like|bookmark|share)$/i.test(path)
if (
  publicCountMutation &&
  ((method === 'POST' && /\/(comments|share)$/i.test(path)) ||
    ((method === 'PUT' || method === 'DELETE') && /\/(like|bookmark)$/i.test(path)))
) return locales.map((locale) => publicFeedTag(locale, 'for_you'))
return []
```

Update `social-invalidation.test.ts` so POST share and PUT/DELETE bookmark return both locale tags, while profile follow and notification read still return `[]`.

- [ ] **Step 5: Run focused Web tests and typecheck and verify GREEN**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web test -- src/app/api/social/'[...path]'/route.test.tsx src/lib/social-invalidation.test.ts src/lib/server-api.test.tsx src/lib/rate-limit-identity.test.tsx
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web typecheck
```

Expected: PASS; successful responses and every local early error are `private, no-store`; an exact declared 8193-byte request fails before token/fetch transport; normalized empty share requests carry neither body nor content type; token-`null` anonymous requests carry no authorization but do carry signed rate-limit identity; malformed responses are redacted; and no untrusted authorization, cookie, forwarded address, or client-supplied rate-limit header reaches the API.

- [ ] **Step 6: Commit the BFF slice**

```bash
git add apps/web/src/app/api/social/'[...path]'/route.ts apps/web/src/app/api/social/'[...path]'/route.test.tsx apps/web/src/lib/server-api.ts apps/web/src/lib/server-api.test.tsx apps/web/src/lib/social-invalidation.ts apps/web/src/lib/social-invalidation.test.ts
git commit -m "feat(web): proxy post share recording safely"
```

### Task 5: Render and update all four interaction counts

**Depends on:** Tasks 2–4 so the UI consumes required totals and records shares through the validated BFF/API path.

**Files:**
- Modify: `apps/web/src/components/social/PostActions.tsx`
- Modify: `apps/web/src/components/social/PostActions.test.tsx`
- Modify: `apps/web/src/components/social/PostCard.tsx:84-108`
- Modify: `apps/web/src/components/social/PostCard.test.tsx`
- Modify: `apps/web/src/app/globals.css:452-489`

- [ ] **Step 1: Add failing component tests for counts and accessible labels**

Define and spread this fixture into every direct `PostActions` render in the file so required props cannot be omitted:

```ts
const authoritativeCounts = {likeCount: 4, commentCount: 2, bookmarkCount: 2, shareCount: 4}
```

Add this zero-count test:

```ts
render(<PostActions bookmarked={false} bookmarkCount={0} canMutate={false} commentCount={0} labels={labels} liked={false} likeCount={0} locale="en" postId={postId} shareCount={0} variant="detail" />)
expect(screen.getByRole('link', {name: 'Like 0'})).toHaveTextContent('0')
expect(screen.getByRole('link', {name: 'Comments 0'})).toHaveTextContent('0')
expect(screen.getByRole('link', {name: 'Bookmark 0'})).toHaveTextContent('0')
expect(screen.getByRole('button', {name: 'Share 0'})).toHaveTextContent('0')
```

Also assert the feed variant renders raw numeric text for all four actions but keeps concise names `Like`, `Comments`, `Bookmark`, and `Share`.

Add a structural regression test with a deliberately long localized `interactionError`. It must prove the four action controls remain direct children of one controls row while all live regions are outside that row in one feedback row:

```ts
const controls = container.querySelector('.post-actions__controls')!
const feedback = container.querySelector('.post-actions__feedback')!
expect(controls.querySelectorAll('.post-action')).toHaveLength(4)
expect(controls.querySelector('[role="status"]')).toBeNull()
expect(feedback).toHaveTextContent('This deliberately long localized action error must wrap below every control without moving them.')
expect(feedback.querySelectorAll('[role="status"]')).toHaveLength(1)
```

Read `globals.css` in the same test and assert `.post-actions__controls` uses a non-wrapping row, while `.post-actions__feedback` has both `width: 100%` and `min-width: 0`. Trigger a second action failure without clearing the first and assert the controls row still has exactly four controls and the feedback row contains two independently keyed status nodes.

- [ ] **Step 2: Add failing bookmark transition tests**

Cover successful add/remove, exact rollback, and per-action pending isolation:

```ts
fireEvent.click(screen.getByRole('button', {name: 'Bookmark'}))
expect(screen.getByRole('button', {name: 'Remove bookmark'})).toHaveTextContent('3')
expect(screen.getByRole('button', {name: 'Remove bookmark'})).toBeDisabled()
expect(screen.getByRole('button', {name: 'Like'})).toBeEnabled()
```

Resolve with `{created:true}` and retain `3`; in a second render reject with `503` and assert state/count restore exactly to `Bookmark 2` plus an error scoped to bookmark.

- [ ] **Step 3: Add failing share outcome tests**

Add separate tests with `navigator.share` and clipboard stubs proving:

```ts
// native success: record only after navigator.share resolves
expect(navigator.share).toHaveBeenCalledWith({url: `${window.location.origin}/en/posts/${postId}`})
expect(fetch).toHaveBeenCalledWith(`/api/social/posts/${postId}/share`, expect.objectContaining({credentials: 'include', headers: {'idempotency-key': expect.any(String)}, method: 'POST', signal: expect.any(AbortSignal)}))

// fallback success: clipboard write precedes the same POST
expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/en/posts/${postId}`)

// AbortError: no record, no count change, no error
await navigator.share.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'))
expect(fetch).not.toHaveBeenCalled()

// record failure/malformed {created:boolean}: no count claim, share-only error
expect(screen.getByRole('button', {name: 'Share 4'})).toHaveTextContent('4')
```

Stub `crypto.randomUUID()` to a valid fixed UUID. Add a retry test in which the first recording fetch rejects after the server may have committed and the second returns `{created:false}`. Advance the 250 ms retry timer and assert both calls carry the same `Idempotency-Key`, native share/copy ran only once, and the visible count moves from `4` to `5` exactly once. A valid `{created:false}` is a durable acknowledgement of this locally completed action, not a reason to suppress the local increment. A fresh second completed share must use a different key and may increment again. While share is pending, only share is disabled; like and bookmark remain enabled.

- [ ] **Step 4: Add failing stale-identity tests**

Extend the existing synchronous rerender test so post A has `{bookmarkCount:2, shareCount:4}`, post B has `{bookmarkCount:8, shareCount:9}`, and an unresolved bookmark/share request on A cannot update B or revive when rendering A again. Assert each new keyed render immediately shows authoritative props, clears action-local errors, and has no pending buttons.

Add a same-viewer, same-post locale transition while a share recording request is unresolved. Render `locale="en"`, complete browser share so the fetch is pending, capture its signal, and rerender the same authoritative props with `locale="zh-CN"`. Assert the old signal is aborted synchronously, the new subtree shows authoritative counts with no pending/error state, and resolving the old request cannot increment it. This is the RED proof that locale belongs to the authenticated subtree identity.

Add a settled-controller lifecycle test. Capture the share fetch signal, resolve the valid response, wait for the share count increment and enabled button, then unmount. Assert the captured signal remains `aborted === false`; unmount must abort only controllers still registered as outstanding.

- [ ] **Step 5: Run component tests and verify RED**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web test -- src/components/social/PostActions.test.tsx src/components/social/PostCard.test.tsx
```

Expected: FAIL because bookmark/share counts and server-side share recording are not implemented.

- [ ] **Step 6: Implement required props and independent state**

Use these exact public/state shapes in `PostActions.tsx`:

```ts
type AsyncAction = 'like' | 'bookmark' | 'share'
type PostActionsProps = {
  postId: string
  liked: boolean
  bookmarked: boolean
  labels: ActionLabels
  locale: Locale
  likeCount: number
  commentCount: number
  bookmarkCount: number
  shareCount: number
  authorId?: string
  followsAuthor?: boolean
  canMutate?: boolean
  returnTo?: string
  variant?: 'feed' | 'detail'
  viewerScope?: string
}
type ActionState = {
  like: boolean
  bookmark: boolean
  likeCount: number
  bookmarkCount: number
  shareCount: number
  pending: Record<AsyncAction, boolean>
  errors: Record<AsyncAction, boolean>
}
```

Include `likeCount`, `bookmarkCount`, `shareCount`, and `locale` in the authenticated subtree key. Key the guest share subtree with `JSON.stringify([postId, shareCount, locale, variant])`. Abort every outstanding controller during keyed-subtree unmount, so a locale transition immediately cancels the old subtree and stale completions cannot update the new locale.

For like/bookmark optimistic state, capture the exact prior boolean/count, update only that action, and restore only those captured values on failure. Use `Math.max(0, previous + (next ? 1 : -1))` for both relationship counts. Set and clear only `pending[action]` and `errors[action]`; do not erase a different action's error.

Implement share completion with this complete control flow:

```ts
async function completeBrowserShare(url: string): Promise<'completed' | 'cancelled'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({url})
      return 'completed'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      throw error
    }
  }
  if (!navigator.clipboard?.writeText) throw new Error('share unavailable')
  await navigator.clipboard.writeText(url)
  return 'completed'
}

function validCreatedResponse(value: unknown): value is {created: boolean} {
  return typeof value === 'object' && value !== null && Object.keys(value).length === 1 && typeof (value as {created?: unknown}).created === 'boolean'
}

function retryDelay(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, 250)
    signal.addEventListener('abort', onAbort, {once: true})
  })
}

async function recordCompletedShare(postId: string, idempotencyKey: string, signal: AbortSignal): Promise<{created:boolean}> {
  let lastError: unknown = new Error('share record failed')
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response
    try {
      response = await fetch(`/api/social/posts/${postId}/share`, {
        credentials: 'include',
        headers: {'idempotency-key': idempotencyKey},
        method: 'POST',
        signal,
      })
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      if (attempt === 0) {
        await retryDelay(signal)
        continue
      }
      throw error
    }
    if (!response.ok) {
      lastError = new Error('share record failed')
      if (attempt === 0 && response.status >= 500) {
        await retryDelay(signal)
        continue
      }
      throw lastError
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new Error('share record failed')
    }
    if (!validCreatedResponse(body)) throw new Error('share record failed')
    return body
  }
  throw lastError
}

async function share() {
  if (state.pending.share) return
  const requestedPostId = postId
  const requestId = ++mutationId.current.share
  const controller = new AbortController()
  controllers.current.share = controller
  const isCurrent = () => !controller.signal.aborted && mutationId.current.share === requestId
  updateState((current) => ({...current, pending: {...current.pending, share: true}, errors: {...current.errors, share: false}}))
  try {
    const url = new URL(`/${locale}/posts/${requestedPostId}`, window.location.origin).toString()
    if (await completeBrowserShare(url) === 'cancelled') return
    const idempotencyKey = crypto.randomUUID()
    await recordCompletedShare(requestedPostId, idempotencyKey, controller.signal)
    if (!isCurrent()) return
    updateState((current) => ({...current, shareCount: current.shareCount + 1}))
  } catch {
    if (isCurrent()) updateState((current) => ({...current, errors: {...current.errors, share: true}}))
  } finally {
    if (isCurrent()) {
      delete controllers.current.share
      updateState((current) => ({...current, pending: {...current.pending, share: false}}))
    }
  }
}
```

Render `<Count>` for bookmark and share in authenticated and guest variants. Use `actionLabel(..., count, locale, variant)` for all four actions, so Detail labels include formatted authoritative totals and Feed labels remain concise. Keep the four buttons/links in a dedicated `.post-actions__controls` element and render independently keyed action-local `role="status"` nodes in a sibling `.post-actions__feedback` element:

```tsx
<footer aria-label={commentsLabel} className="post-actions">
  <div className="post-actions__controls">{beforeComment}{commentAction}{afterComment}{shareAction}</div>
  <div className="post-actions__feedback" aria-atomic="false">{feedback}</div>
</footer>
```

Use these stable layout rules; do not let feedback participate in the controls flex line:

```css
.post-actions__controls {
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 14px;
  min-width: 0;
}
.post-actions__feedback {
  display: grid;
  gap: 4px;
  min-width: 0;
  width: 100%;
}
.post-actions__feedback .interaction-error {
  overflow-wrap: anywhere;
}
```

- [ ] **Step 7: Pass authoritative counts from `PostCard`**

In both `PostActions` calls in `PostCard.tsx`, pass:

```tsx
bookmarkCount={post.bookmarkCount}
commentCount={commentCountOverride ?? post.commentCount}
likeCount={post.likeCount}
shareCount={post.shareCount}
```

- [ ] **Step 8: Run focused Web tests and verify GREEN**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web test -- src/components/social/PostActions.test.tsx src/components/social/PostCard.test.tsx src/components/social/SocialContent.test.tsx
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web typecheck
```

Expected: PASS for zero rendering, feed/detail labels, exact bookmark rollback, native and clipboard success, cancellation neutrality, record failure, independent pending/error scopes in a full-width row, a fixed four-control row under long localized feedback, post/viewer/locale reset, synchronous abortion of old-locale work, and removal of settled share controllers.

- [ ] **Step 9: Commit the UI slice**

```bash
git add apps/web/src/components/social/PostActions.tsx apps/web/src/components/social/PostActions.test.tsx apps/web/src/components/social/PostCard.tsx apps/web/src/components/social/PostCard.test.tsx apps/web/src/app/globals.css
git commit -m "feat(web): show authoritative interaction counts"
```

### Task 6: Run full verification and Preview acceptance

**Depends on:** Tasks 1–5 complete with no transitional RED checkpoint left in the branch.

**Files:**
- Verify: all files listed in this plan
- Inspect: `docs/operations/HANDOFF.md`

- [ ] **Step 1: Run every automated gate**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm db:test
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm test
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm typecheck
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm build
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm license:check
git diff --check
```

Expected: all commands exit `0`; database tests run with no environment-gated skips under `db:test`; strict contract, API, BFF, component, typecheck, production builds, migration and license checks all pass. The bounded share/platform-comment and share/human-comment probes terminate without `40P01`, lock timeout, statement timeout, leaked transaction, or test-process hang.

- [ ] **Step 2: Audit the privacy/ranking invariants from source**

Run:

```bash
rg -n "post_share_events|record_post_share|platform_publish_ip_comment|active_creator_revision_id|creator_revisions|idempotency_key|bookmark_count|share_count|FOR (SHARE|UPDATE)|ORDER BY ip.profile_id" packages/db/migrations/202609030002_interaction_counts.sql packages/db/src/schema.ts packages/db/src/social.ts
rg -n "PlatformPostRow|bookmark_count: 0|share_count: 0|platform_publish_post" packages/db/src/social.ts packages/db/migrations/202609030002_interaction_counts.sql packages/db/migrations/202609010029_post_media_pipeline.sql
rg -n "ip|user.agent|destination|copied.url|share_count.*\+|bookmark_count.*\+" packages/db/migrations/202609030002_interaction_counts.sql
```

Expected: the first command shows the ledger, creator visibility guard, bounded command, projections, and post → sorted-IP order in the platform replacement. The second shows that only the platform repository supplies transactionally known zero values while the SQL publish signature remains unchanged. The final privacy command finds no persisted network/browser/destination field and no bookmark/share ranking term; inspect any match to confirm it is a test/comment rather than stored metadata or score arithmetic.

- [ ] **Step 3: Pin the candidate and migrate the isolated Preview database**

Run:

```bash
git rev-parse HEAD
git status --short
DATABASE_URL="$PREVIEW_DATABASE_URL" DATABASE_ADMIN_URL="$PREVIEW_DATABASE_ADMIN_URL" PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir packages/db migrate
DATABASE_URL="$PREVIEW_DATABASE_URL" DATABASE_ADMIN_URL="$PREVIEW_DATABASE_ADMIN_URL" PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir packages/db migrate
```

Expected: save the printed SHA; the worktree is clean; the first migration command lists `202609030002_interaction_counts.sql` once (and `202609030001_relike_notification.sql` if that independent plan has not yet reached this Preview branch); the second prints no filenames. Confirm the URLs target an isolated Neon Preview branch. Do not echo or persist credentials.

- [ ] **Step 4: Deploy the exact SHA to API and Web Preview**

Use the Vercel project dashboard to deploy the Step 3 SHA to the API Preview project, then the Web Preview project. Verify both deployment detail pages show that exact SHA and Preview environment variables. Do not deploy or modify `main` during Preview acceptance.

- [ ] **Step 5: Execute interaction acceptance**

Using one published test post, verify:

1. Bookmark add/remove changes the displayed total immediately, survives refresh, and changes only the signed-in human's private Bookmarks collection.
2. Cancelling native share leaves the share total unchanged and shows no interaction error.
3. Completing native share records once, increments after the API response, and persists after refresh.
4. In a browser without native share, successful clipboard copy follows the same record/increment behavior.
5. Signed-out share succeeds and persists without creating an account.
6. A forced first-attempt transport failure followed by a retry sends the same `Idempotency-Key` twice, invokes browser share/copy once, stores one event, and increments the displayed total once even when the acknowledgement is `{created:false}`.
7. A forced/observed exhausted recording failure shows the existing interaction error and does not increment the displayed total.
8. At both the API and BFF boundary, an absent body and `{}` with `application/json; charset=utf-8` succeed, while explicitly streamed empty/whitespace `text/plain`, `application/jsonx`, and `application/jsonp` requests fail before recording or changing the count.
9. Feed, following, liked, bookmarks, search, public profile, and detail all show numeric like/comment/bookmark/share values, including `0`.

Expected: counts agree after refresh and no endpoint exposes bookmark owners or share-event rows.

- [ ] **Step 6: Complete responsive, theme, and log acceptance**

At widths `430`, `768`, `1024`, and `1440`, inspect feed, search, Bookmarks/Liked collections, public profile, and detail in light and dark themes.

Expected: all four actions remain readable and keyboard accessible; Detail accessible names contain formatted counts while Feed names stay concise; no browser console errors occur. Search API/Web logs for the acceptance request IDs and confirm no new 5xx, constraint detail leakage, or raw IP/user-agent/share destination logging.

- [ ] **Step 7: Preserve non-secret evidence**

Record the Preview URLs, exact SHA, applied migration names, test post ID, request IDs, viewport/theme matrix, before/after counts, and no-5xx log result in the release task. Exclude credentials, cookies, bearer tokens, database URLs, clipboard contents, and network identifiers.
