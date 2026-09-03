# Authoritative Interaction Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose durable bookmark/share totals on every post payload and make successful native-share or copy actions record an idempotent, privacy-preserving server event for signed-in and signed-out viewers.

**Architecture:** A forward PostgreSQL migration adds a write-only share ledger keyed by `(post_id, idempotency_key)`, a lock-safe optional-actor command, and two new fields in the existing post-metrics/search projections without changing ranking. The shared strict contract then forces every feed/detail producer and fixture to carry both counts; the API and same-origin Web BFF independently validate a UUID `Idempotency-Key` and the empty share command, while the shared post action component generates one key per completed browser share and reuses it across a bounded recording retry.

**Tech Stack:** PostgreSQL, Drizzle schema declarations, TypeScript, Zod, Hono, Next.js 16 App Router, React 19, Vitest/Testing Library, pnpm, Docker Compose.

---

## File map

### Database and repository

- Create `packages/db/migrations/202609030002_interaction_counts.sql`: create `post_share_events`, its `post_id`-leading index, `record_post_share`, expanded `social_post_metrics`, and the recreated search-post projection.
- Modify `packages/db/src/schema.ts`: declare the share ledger for schema parity.
- Modify `packages/db/src/index.ts`: export `postShareEvents`.
- Modify `packages/db/src/social.ts`: project both counts and implement `recordPostShare(viewer, postId, idempotencyKey)` through the correct anonymous/authenticated session.
- Modify `packages/db/tests/social-repository.test.ts`: integration coverage for both actor modes, post-scoped idempotency, visibility races, privacy, and every post producer.
- Modify `packages/db/tests/social-feed-projection.unit.test.ts`: row fixture and mapping assertions.
- Modify `packages/db/tests/social-search.test.ts`: expanded search projection/fixture assertions.
- Modify `packages/db/tests/platform-social.test.ts`: published-post response fixture/expectations.

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

### Strict `FeedPost` fixture updates

The contract has no fallback. Add `bookmarkCount` and `shareCount` to every strict post literal in these files as part of Task 3; do not make either field optional to silence errors:

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
```

Add these committed-fixture and bounded lock-probe helpers beside the existing comment concurrency helpers:

```ts
async function committedShareFixture() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const author = await ip(client)
    const postId = await post(client, author)
    await client.query('COMMIT')
    return {author, postId}
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

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

Then add two two-connection tests. The state-changing transaction acquires its update lock first; the share call must block, observe the committed state, reject with `P0002`, and leave no ledger row:

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
    await expect(shareClient.query('SELECT 1 FROM public.post_share_events WHERE post_id=$1', [fixture.postId])).resolves.toMatchObject({rowCount:0})
  } finally {
    await Promise.all([stateClient.query('ROLLBACK').catch(() => undefined), shareClient.query('ROLLBACK').catch(() => undefined)])
    stateClient.release()
    shareClient.release()
  }
})
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

### Task 2: Add the share ledger, bounded command, and aggregate projection

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
DECLARE actor_id uuid; owner_id uuid; current_revision_id uuid; did_create boolean := false;
BEGIN
  SELECT post.author_profile_id INTO owner_id
  FROM public.posts post
  WHERE post.id=target_post_id AND post.state='published'
  FOR SHARE;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'published post not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT ip.current_identity_revision_id INTO current_revision_id
  FROM public.ip_profiles ip
  WHERE ip.profile_id=owner_id AND ip.public_state='published'
  FOR SHARE;
  IF current_revision_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.ip_identity_revisions identity
    WHERE identity.id=current_revision_id AND identity.ip_profile_id=owner_id
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

- [ ] **Step 5: Apply the migration and verify GREEN**

Run:

```bash
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm db:migrate
DATABASE_URL=postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir packages/db test -- social-repository.test.ts social-search.test.ts social-feed-projection.unit.test.ts platform-social.test.ts
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir packages/db typecheck
```

Expected: migration output includes `202609030002_interaction_counts.sql`; all focused tests PASS. The authenticated and anonymous role checks have execute-only access to the command, the ledger exposes exactly five columns, and all seven producer paths return both counts.

- [ ] **Step 6: Commit the database slice**

```bash
git add packages/db/migrations/202609030002_interaction_counts.sql packages/db/src/schema.ts packages/db/src/index.ts packages/db/src/social.ts packages/db/tests/social-feed-projection.unit.test.ts packages/db/tests/platform-social.test.ts
git commit -m "feat(db): add durable post interaction counts"
```

### Task 3: Make both counts mandatory in the shared contract and every fixture

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

- [ ] **Step 5: Run contract and workspace type checks and verify GREEN**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir packages/contracts test -- social.test.ts
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm typecheck
```

Expected: PASS. Any remaining type error about missing `bookmarkCount` or `shareCount` identifies an unlisted strict producer/fixture; add both required numeric properties at that construction point rather than weakening the schema.

- [ ] **Step 6: Commit the strict contract slice**

```bash
git add packages/contracts/src/social.ts packages/contracts/src/social.test.ts apps/api/src/routes/admin.test.ts apps/api/src/routes/social.test.ts apps/web/src/app/'[locale]'/posts/'[postId]'/page.test.tsx apps/web/src/app/'[locale]'/search/page.test.tsx apps/web/src/components/admin/AdminConsole.test.tsx apps/web/src/components/profile/MyProfileTabs.test.tsx apps/web/src/components/social/PublicProfileContent.test.tsx apps/web/src/components/social/SocialContent.test.tsx apps/web/src/components/social/PostCard.test.tsx apps/web/src/components/social/search-ranking.test.ts apps/web/src/lib/social-api.test.tsx apps/web/src/lib/social-cache.test.tsx packages/db/tests/social-search.test.ts
git commit -m "feat(contracts): require all post interaction counts"
```

### Task 4: Add the optional-auth share API and abuse controls

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

it('accepts only a strict empty JSON object when a share body is present', async () => {
  const idempotencyKey = randomUUID()
  const response = await createApp({auth: missingAuth, profiles: profilePort(), social: socialPort()}).request(`/v1/posts/${postId}/share`, {
    method: 'POST',
    headers: {'content-type': 'application/json', 'idempotency-key': idempotencyKey},
    body: '{}',
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({created:true})
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

Import `ShareRecordedSchema` in `apps/api/src/routes/social.ts`. Keep the existing `parseEmptyBody` for existing relationship commands and add this share-specific parser; the global 65,536-byte middleware remains the hard payload bound:

```ts
async function parseShareBody(c: ApiContext): Promise<boolean> {
  const text = await c.req.text()
  if (!text.trim()) return true
  if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json')) return false
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

### Task 5: Allow the share command through the same-origin Web BFF

**Files:**
- Modify: `apps/web/src/app/api/social/[...path]/route.ts:1-116`
- Modify: `apps/web/src/app/api/social/[...path]/route.test.tsx:30-109`
- Modify: `apps/web/src/lib/server-api.ts`
- Modify: `apps/web/src/lib/server-api.test.tsx`
- Modify: `apps/web/src/lib/social-invalidation.ts`
- Modify: `apps/web/src/lib/social-invalidation.test.ts`

- [ ] **Step 1: Add failing BFF tests**

Add a test that invokes `POST` with both an absent body and `{}` and verifies the exact upstream request:

```ts
it('proxies only same-origin empty share POSTs with strict private responses and one trusted key', async () => {
  process.env.AIFANS_API_URL = 'https://internal-api.example'
  process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET = 's'.repeat(32)
  const upstream = vi.fn()
    .mockResolvedValueOnce(Response.json({created: true}, {status: 200, headers: {'x-request-id': 'upstream-id-1'}}))
    .mockResolvedValueOnce(Response.json({created: false}, {status: 200, headers: {'x-request-id': 'upstream-id-2'}}))
  vi.stubGlobal('fetch', upstream)
  const path = ['posts', '22222222-2222-4222-8222-222222222222', 'share']
  const idempotencyKey = '33333333-3333-4333-8333-333333333333'
  for (const [index, body] of [undefined, '{}'].entries()) {
    const headers = new Headers({origin: 'https://web.example', 'idempotency-key': idempotencyKey, 'x-vercel-forwarded-for': '203.0.113.7', authorization: 'Bearer forged', 'x-aifans-rate-limit-identity': 'forged'})
    if (body !== undefined) headers.set('content-type', 'application/json')
    const response = await POST(new Request(`https://web.example/api/social/${path.join('/')}`, {method: 'POST', headers, ...(body === undefined ? {} : {body})}), {params: Promise.resolve({path})})
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({created: index === 0})
  }
  for (const [, init] of upstream.mock.calls) {
    const sent = new Headers((init as RequestInit).headers)
    expect(sent.get('authorization')).toBe('Bearer signed-jwt')
    expect(sent.get('idempotency-key')).toBe(idempotencyKey)
    expect(sent.get('x-aifans-rate-limit-identity')).toMatch(/^v1\./)
    expect(sent.has('cookie')).toBe(false)
    expect(sent.has('x-vercel-forwarded-for')).toBe(false)
  }
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
  [new Request(`https://web.example/api/social/posts/${postId}/share`, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/json', 'idempotency-key': postId}, body: 'x'.repeat(8193)}), 413],
] as const)('rejects an invalid share proxy request before transport', async (request, status) => {
  process.env.AIFANS_API_URL = 'https://internal-api.example'
  const upstream = vi.fn()
  vi.stubGlobal('fetch', upstream)
  const response = await POST(request, {params: Promise.resolve({path: ['posts', postId, 'share']})})
  expect(response.status).toBe(status)
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

Define `const postId = '22222222-2222-4222-8222-222222222222'` once at the top of the describe block. Add a wrong-path assertion with `POST .../profiles/:id/share` returning `404` and no upstream call.

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

Inside `proxy`, derive `const shareRequest = method === 'POST' && /\/share$/.test(path)`. Before reading a share body, require `request.headers.get('idempotency-key')` to match the existing UUID expression or return `400 INVALID_REQUEST`. Accept an absent body without a content type. When `request.body !== null`, require `application/json`, use the existing bounded reader, reject duplicate keys, and require the parsed value to be a non-array object with `Object.keys(value).length === 0`; normalize valid `''` or `{}` to an undefined upstream body. Reject other share bodies with `422 INVALID_REQUEST`, while retaining the bounded comment parser only for non-share POSTs. Use:

```ts
const shareRequest = method === 'POST' && /\/share$/.test(path)
const idempotencyKey = shareRequest ? request.headers.get('idempotency-key') : null
if (shareRequest && (!idempotencyKey || !uuid.test(idempotencyKey))) {
  return Response.json({code:'INVALID_REQUEST'}, {status:400})
}

let body: string | undefined
if (shareRequest && request.body !== null) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
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

Expected: PASS; successful responses are `private, no-store`, malformed responses are redacted, and no untrusted authorization, cookie, forwarded address, or client-supplied rate-limit header reaches the API.

- [ ] **Step 6: Commit the BFF slice**

```bash
git add apps/web/src/app/api/social/'[...path]'/route.ts apps/web/src/app/api/social/'[...path]'/route.test.tsx apps/web/src/lib/server-api.ts apps/web/src/lib/server-api.test.tsx apps/web/src/lib/social-invalidation.ts apps/web/src/lib/social-invalidation.test.ts
git commit -m "feat(web): proxy post share recording safely"
```

### Task 6: Render and update all four interaction counts

**Files:**
- Modify: `apps/web/src/components/social/PostActions.tsx`
- Modify: `apps/web/src/components/social/PostActions.test.tsx`
- Modify: `apps/web/src/components/social/PostCard.tsx:84-108`
- Modify: `apps/web/src/components/social/PostCard.test.tsx`

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

Include `likeCount`, `bookmarkCount`, and `shareCount` in the authenticated subtree key. Key the guest share subtree with `JSON.stringify([postId, shareCount, locale, variant])`. Abort every outstanding controller during keyed-subtree unmount.

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
    if (isCurrent()) updateState((current) => ({...current, pending: {...current.pending, share: false}}))
  }
}
```

Render `<Count>` for bookmark and share in authenticated and guest variants. Use `actionLabel(..., count, locale, variant)` for all four actions, so Detail labels include formatted authoritative totals and Feed labels remain concise. Render action-local `role="status"` errors adjacent to the failing action.

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

Expected: PASS for zero rendering, feed/detail labels, exact bookmark rollback, native and clipboard success, cancellation neutrality, record failure, independent pending/error scopes, and post/viewer reset.

- [ ] **Step 9: Commit the UI slice**

```bash
git add apps/web/src/components/social/PostActions.tsx apps/web/src/components/social/PostActions.test.tsx apps/web/src/components/social/PostCard.tsx apps/web/src/components/social/PostCard.test.tsx
git commit -m "feat(web): show authoritative interaction counts"
```

### Task 7: Run full verification and Preview acceptance

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

Expected: all commands exit `0`; database tests run with no environment-gated skips under `db:test`; strict contract, API, BFF, component, typecheck, production builds, migration and license checks all pass.

- [ ] **Step 2: Audit the privacy/ranking invariants from source**

Run:

```bash
rg -n "post_share_events|record_post_share|idempotency_key|bookmark_count|share_count" packages/db/migrations/202609030002_interaction_counts.sql packages/db/src/schema.ts packages/db/src/social.ts
rg -n "ip|user.agent|destination|copied.url|share_count.*\+|bookmark_count.*\+" packages/db/migrations/202609030002_interaction_counts.sql
```

Expected: the first command shows the ledger, bounded command, and projections. The second command finds no persisted network/browser/destination field and no bookmark/share ranking term; inspect any match to confirm it is a test/comment rather than stored metadata or score arithmetic.

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
8. Feed, following, liked, bookmarks, search, public profile, and detail all show numeric like/comment/bookmark/share values, including `0`.

Expected: counts agree after refresh and no endpoint exposes bookmark owners or share-event rows.

- [ ] **Step 6: Complete responsive, theme, and log acceptance**

At widths `430`, `768`, `1024`, and `1440`, inspect feed, search, Bookmarks/Liked collections, public profile, and detail in light and dark themes.

Expected: all four actions remain readable and keyboard accessible; Detail accessible names contain formatted counts while Feed names stay concise; no browser console errors occur. Search API/Web logs for the acceptance request IDs and confirm no new 5xx, constraint detail leakage, or raw IP/user-agent/share destination logging.

- [ ] **Step 7: Preserve non-secret evidence**

Record the Preview URLs, exact SHA, applied migration names, test post ID, request IDs, viewport/theme matrix, before/after counts, and no-5xx log result in the release task. Exclude credentials, cookies, bearer tokens, database URLs, clipboard contents, and network identifiers.
