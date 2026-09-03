import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { commentBookmarks, comments, ipProfiles, notifications } from '../src/schema.js'

const connectionString = process.env.DATABASE_URL ?? ''
const describeIntegration = connectionString ? describe : describe.skip
const pool = new Pool({ connectionString })

type Human = { id: string; subject: string }
type Ip = { id: string }

async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    return await callback(client)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    client.release()
  }
}

async function savepoint<T>(client: PoolClient, callback: () => Promise<T>): Promise<T> {
  await client.query('SAVEPOINT expected_failure')
  try {
    const result = await callback()
    await client.query('RELEASE SAVEPOINT expected_failure')
    return result
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT expected_failure')
    await client.query('RELEASE SAVEPOINT expected_failure')
    throw error
  }
}

async function human(client: PoolClient): Promise<Human> {
  const id = randomUUID()
  const subject = `auth-${randomUUID()}`
  await client.query(
    `INSERT INTO public.profiles (id, auth_subject, account_kind, username, display_name)
     VALUES ($1, $2, 'human', $3, 'Human fixture')`,
    [id, subject, `human_${id.replaceAll('-', '').slice(0, 20)}`],
  )
  return { id, subject }
}

async function ip(client: PoolClient, state: 'published' | 'draft' | 'paused' = 'published'): Promise<Ip> {
  const id = randomUUID()
  await client.query(
    `INSERT INTO public.profiles (id, account_kind, username, display_name)
     VALUES ($1, 'ip', $2, 'IP fixture')`,
    [id, `ip_${id.replaceAll('-', '').slice(0, 20)}`],
  )
  await client.query(
    `INSERT INTO public.ip_profiles (profile_id, source, operation_enabled)
     VALUES ($1, 'platform', true)`,
    [id],
  )
  const revisionId = randomUUID()
  await client.query(`INSERT INTO public.ip_identity_revisions (id, ip_profile_id, version, display_name) VALUES ($1, $2, 1, 'IP fixture')`, [revisionId, id])
  await client.query('UPDATE public.ip_profiles SET current_identity_revision_id = $1, public_state = $2 WHERE profile_id = $3', [revisionId, state, id])
  return { id }
}

async function publishedPost(client: PoolClient, authorProfileId: string, body = 'A real text post'): Promise<string> {
  const id = randomUUID()
  await client.query(
    `INSERT INTO public.posts (id, author_profile_id, source, state, body, published_at)
     VALUES ($1, $2, 'worker', 'published', $3, clock_timestamp())`,
    [id, authorProfileId, body],
  )
  return id
}

async function become(client: PoolClient, subject: string | null): Promise<void> {
  await client.query('SET LOCAL ROLE aifans_authenticated')
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(subject ? { sub: subject } : {})])
}

async function insertTopLevelPostAsHuman(client: PoolClient, actor: Human, ipId: string) {
  await become(client, actor.subject)
  return client.query(
    `INSERT INTO public.posts (id, author_profile_id, source, body)
     VALUES ($1, $2, 'worker', 'not allowed')`,
    [randomUUID(), ipId],
  )
}

async function insertIpCommentAsHuman(client: PoolClient, actor: Human, ipId: string, postId: string) {
  await become(client, actor.subject)
  return client.query(
    `INSERT INTO public.comments (id, post_id, author_profile_id, source, body)
     VALUES ($1, $2, $3, 'worker', 'not allowed')`,
    [randomUUID(), postId, ipId],
  )
}

async function createOwnBookmark(client: PoolClient, actor: Human, postId: string) {
  await become(client, actor.subject)
  await client.query('SELECT public.bookmark_post($1)', [postId])
}

async function readOtherBookmark(client: PoolClient, actor: Human, ownerId: string, postId: string) {
  await become(client, actor.subject)
  return (await client.query('SELECT * FROM public.bookmarks WHERE profile_id = $1 AND post_id = $2', [ownerId, postId])).rows
}

describeIntegration('social core authorization', () => {
  afterAll(async () => pool.end())

  it('prevents humans from authoring as IPs while retaining private own bookmarks', async () => {
    await transaction(async (client) => {
      const first = await human(client)
      const second = await human(client)
      const author = await ip(client)
      const postId = await publishedPost(client, author.id)

      await expect(savepoint(client, () => insertTopLevelPostAsHuman(client, first, author.id))).rejects.toThrow(/permission denied|row-level security/)
      await expect(savepoint(client, () => insertIpCommentAsHuman(client, first, author.id, postId))).rejects.toThrow(/permission denied|row-level security/)
      await expect(createOwnBookmark(client, first, postId)).resolves.toBeUndefined()
      await expect(readOtherBookmark(client, second, first.id, postId)).resolves.toHaveLength(0)
    })
  })

  it('limits human interactions to the current actor and published public content', async () => {
    await transaction(async (client) => {
      const first = await human(client)
      const second = await human(client)
      const author = await ip(client)
      const postId = await publishedPost(client, author.id)
      await become(client, first.subject)
      await client.query('SELECT public.follow_profile($1,$2)', [author.id, randomUUID()])
      await client.query('SELECT public.like_post($1,$2)', [postId, randomUUID()])
      const comment=(await client.query<{id:string}>("SELECT id FROM public.create_human_comment($1,NULL,'A real comment',$2)",[postId,randomUUID()])).rows[0]!.id
      await expect(savepoint(client, () => client.query('DELETE FROM public.post_likes WHERE profile_id = $1', [second.id]))).rejects.toThrow(/permission denied/)
      const count = await client.query('SELECT count(*)::int AS count FROM public.post_likes WHERE profile_id = $1', [second.id])
      expect(count.rows[0]?.count).toBe(0)
      await expect(savepoint(client, () => client.query("SELECT id FROM public.create_human_comment($1,$2,'Reply',$3)",[postId,comment,randomUUID()]))).resolves.toBeTruthy()
    })
  })

  it('exposes only published safe projections and permits text-only posts', async () => {
    await transaction(async (client) => {
      const visible = await ip(client, 'published')
      const hidden = await ip(client, 'paused')
      const postId = await publishedPost(client, visible.id, 'Text only is valid')
      await client.query('SET LOCAL ROLE aifans_anon')
      const publicIps = await client.query(
        'SELECT profile_id FROM public.ip_profiles WHERE profile_id = ANY($1::uuid[])',
        [[visible.id, hidden.id]],
      )
      expect(publicIps.rows).toEqual([{ profile_id: visible.id }])
      const posts = await client.query('SELECT id FROM public.posts WHERE id=$1', [postId])
      expect(posts.rows).toEqual([{ id: postId }])
      await expect(savepoint(client, () => client.query('SELECT auth_subject FROM public.profiles'))).rejects.toThrow(/permission denied/)
      await expect(savepoint(client, () => client.query('SELECT acting_operator_profile_id FROM public.posts'))).rejects.toThrow(/permission denied/)
      expect(hidden.id).toBeTruthy()
    })
  })

  it('keeps comment attribution hidden and permits controlled post lifecycle transitions', async () => {
    await transaction(async (client) => {
      const author = await ip(client)
      const postId = await publishedPost(client, author.id)
      const commentId = randomUUID()
      const reader = await human(client)
      await client.query(`INSERT INTO public.comments (id, post_id, author_profile_id, source, body) VALUES ($1, $2, $3, 'human', 'Safe comment')`, [commentId, postId, reader.id])
      const draftId = randomUUID()
      await client.query(`INSERT INTO public.posts (id, author_profile_id, source, body) VALUES ($1, $2, 'worker', 'Draft')`, [draftId, author.id])
      await expect(client.query(`UPDATE public.posts SET body = 'Edited draft' WHERE id = $1`, [draftId])).resolves.toMatchObject({rowCount: 1})
      await expect(client.query(`UPDATE public.posts SET state = 'published', published_at = clock_timestamp() WHERE id = $1`, [draftId])).resolves.toMatchObject({rowCount: 1})
      await client.query('SET LOCAL ROLE aifans_anon')
      await expect(client.query('SELECT id, body FROM public.social_public_comments($1,NULL,NULL,10) WHERE id = $2', [postId,commentId])).resolves.toMatchObject({rowCount: 1})
      await expect(savepoint(client, () => client.query('SELECT acting_operator_profile_id, source FROM public.comments'))).rejects.toThrow(/permission denied/)
    })
  })

  it('keeps deleted identities out of the legacy anonymous comment projection',async()=>transaction(async client=>{
    const author=await ip(client),actor=await human(client),postId=await publishedPost(client,author.id),root=randomUUID(),reply=randomUUID()
    await client.query("INSERT INTO public.comments(id,post_id,author_profile_id,source,body) VALUES($1,$2,$3,'human','deleted root')",[root,postId,actor.id])
    await client.query("INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body) VALUES($1,$2,$3,$4,'human','public reply')",[reply,postId,root,actor.id])
    await client.query("UPDATE public.comments SET state='deleted',deleted_at=clock_timestamp() WHERE id=$1",[root])
    await client.query('SET LOCAL ROLE aifans_anon')
    await expect(client.query('SELECT id,author_id,body,state FROM public.social_public_comments($1,NULL,NULL,10) WHERE id=$2',[postId,root])).resolves.toMatchObject({rowCount:0})
  }))

  it('enforces immutable identities, soft deletion, notification ownership, and IP identity lifecycle', async () => {
    await transaction(async (client) => {
      const first = await human(client)
      const second = await human(client)
      const author = await ip(client)
      const postId = await publishedPost(client, author.id)
      const revision = await client.query('SELECT current_identity_revision_id FROM public.ip_profiles WHERE profile_id = $1', [author.id])
      const revisionId = revision.rows[0]?.current_identity_revision_id as string
      await expect(savepoint(client, () => client.query('UPDATE public.ip_identity_revisions SET display_name = $1 WHERE id = $2', ['Changed', revisionId]))).rejects.toThrow(/immutable/)
      await expect(savepoint(client, () => client.query('DELETE FROM public.ip_identity_revisions WHERE id = $1', [revisionId]))).rejects.toThrow(/immutable/)
      const commentId = randomUUID()
      await client.query(`INSERT INTO public.comments (id, post_id, author_profile_id, source, body) VALUES ($1, $2, $3, 'human', 'Delete me')`, [commentId, postId, first.id])
      await expect(savepoint(client, () => client.query('DELETE FROM public.comments WHERE id = $1', [commentId]))).rejects.toThrow(/soft deleted/)
      await client.query(`UPDATE public.comments SET state = 'deleted', deleted_at = clock_timestamp() WHERE id = $1`, [commentId])
      expect((await client.query('SELECT state FROM public.comments WHERE id = $1', [commentId])).rows).toEqual([{state: 'deleted'}])
      await expect(savepoint(client, () => client.query('DELETE FROM public.posts WHERE id = $1', [postId]))).rejects.toThrow(/cannot be deleted/)
      const notificationId = randomUUID()
      await client.query(`INSERT INTO public.notifications (id, recipient_profile_id, actor_profile_id, kind, post_id) VALUES ($1, $2, $3, 'post_like', $4)`, [notificationId, first.id, author.id, postId])
      await become(client, second.subject)
      expect((await client.query('SELECT id FROM public.notifications')).rows).toEqual([])
      await expect(savepoint(client, () => client.query(`INSERT INTO public.notifications (id, recipient_profile_id, kind) VALUES ($1, $2, 'follow')`, [randomUUID(), second.id]))).rejects.toThrow(/permission denied/)
      await become(client, first.subject)
      await expect(client.query('UPDATE public.notifications SET read_at = clock_timestamp() WHERE id = $1', [notificationId])).resolves.toMatchObject({rowCount: 1})
      await expect(client.query('UPDATE public.notifications SET read_at = clock_timestamp() WHERE id = $1', [notificationId])).resolves.toMatchObject({rowCount: 0})
    })
  })

  it('enforces IP identity ownership, media publish content, and comment topology', async () => {
    await transaction(async (client) => {
      const firstIp = await ip(client)
      const secondIp = await ip(client)
      const secondRevision = (await client.query('SELECT current_identity_revision_id FROM public.ip_profiles WHERE profile_id = $1', [secondIp.id])).rows[0]?.current_identity_revision_id as string
      await expect(savepoint(client, async () => { await client.query('UPDATE public.ip_profiles SET current_identity_revision_id = $1 WHERE profile_id = $2', [secondRevision, firstIp.id]); await client.query('SET CONSTRAINTS ALL IMMEDIATE') })).rejects.toThrow(/foreign key/)
      const missingIdentity = randomUUID()
      await client.query(`INSERT INTO public.profiles (id, account_kind, username, display_name) VALUES ($1, 'ip', $2, 'No identity')`, [missingIdentity, `ip_${missingIdentity.replaceAll('-', '').slice(0, 20)}`])
      await expect(savepoint(client, async () => {
        await client.query(`INSERT INTO public.ip_profiles (profile_id, source, public_state) VALUES ($1, 'platform', 'published')`, [missingIdentity])
        await client.query('SET CONSTRAINTS ALL IMMEDIATE')
      })).rejects.toThrow(/current identity revision/)
      const mediaOnly = randomUUID()
      await client.query(`INSERT INTO public.posts (id, author_profile_id, source) VALUES ($1, $2, 'worker')`, [mediaOnly, firstIp.id])
      await client.query(`INSERT INTO public.post_media (id, post_id, position, object_key, content_type) VALUES ($1, $2, 1, 'posts/one.png', 'image/png')`, [randomUUID(), mediaOnly])
      await client.query(`UPDATE public.posts SET state = 'published', published_at = clock_timestamp() WHERE id = $1`, [mediaOnly])
      await expect(savepoint(client, async () => {
        await client.query('DELETE FROM public.post_media WHERE post_id = $1', [mediaOnly])
        await client.query('SET CONSTRAINTS ALL IMMEDIATE')
      })).rejects.toThrow(/nonblank text or verified media/)
      const both = randomUUID()
      await client.query(`INSERT INTO public.posts (id, author_profile_id, source, body) VALUES ($1, $2, 'worker', 'Text and image')`, [both, firstIp.id])
      for (let position = 1; position <= 4; position += 1) await client.query(`INSERT INTO public.post_media (id, post_id, position, object_key, content_type) VALUES ($1, $2, $3, $4, 'image/png')`, [randomUUID(), both, position, `posts/${position}.png`])
      await expect(savepoint(client, () => client.query(`INSERT INTO public.post_media (id, post_id, position, object_key, content_type) VALUES ($1, $2, 5, 'posts/five.png', 'image/png')`, [randomUUID(), both]))).rejects.toThrow(/check/)
      await client.query(`UPDATE public.posts SET state = 'published', published_at = clock_timestamp() WHERE id = $1`, [both])
      const otherPost = await publishedPost(client, firstIp.id)
      const parent = randomUUID()
      const humanAuthor = await human(client)
      await client.query(`INSERT INTO public.comments (id, post_id, author_profile_id, source, body) VALUES ($1, $2, $3, 'human', 'Parent')`, [parent, mediaOnly, humanAuthor.id])
      await expect(savepoint(client, () => client.query(`INSERT INTO public.comments (id, post_id, parent_comment_id, author_profile_id, source, body) VALUES ($1, $2, $3, $4, 'human', 'Wrong post')`, [randomUUID(), otherPost, parent, humanAuthor.id]))).rejects.toThrow(/invalid reply parent/)
      const reply = randomUUID()
      await client.query(`INSERT INTO public.comments (id, post_id, parent_comment_id, author_profile_id, source, body) VALUES ($1, $2, $3, $4, 'human', 'Reply')`, [reply, mediaOnly, parent, humanAuthor.id])
      const deep=randomUUID()
      await expect(client.query(`INSERT INTO public.comments (id, post_id, parent_comment_id, author_profile_id, source, body) VALUES ($1, $2, $3, $4, 'human', 'Deep reply') RETURNING root_comment_id`, [deep, mediaOnly, reply, humanAuthor.id])).resolves.toMatchObject({rows:[{root_comment_id:parent}]})
      await become(client, humanAuthor.subject)
      await expect(savepoint(client, () => client.query(`INSERT INTO public.comments (id, post_id, author_profile_id, source, body) VALUES ($1, $2, $3, 'human', '   ')`, [randomUUID(), mediaOnly, humanAuthor.id]))).rejects.toThrow(/permission denied/)
      await expect(savepoint(client, () => client.query(`INSERT INTO public.comments (id, post_id, author_profile_id, acting_operator_profile_id, source, body) VALUES ($1, $2, $3, $4, 'human', 'No impersonation')`, [randomUUID(), mediaOnly, firstIp.id, humanAuthor.id]))).rejects.toThrow(/permission denied|row-level security|human comments require/)
    })
  })

  it('prevents cross-user mutation of existing relationships and notification reads', async () => {
    await transaction(async (client) => {
      const first = await human(client); const second = await human(client); const author = await ip(client); const postId = await publishedPost(client, author.id)
      const commentId = randomUUID()
      await client.query(`INSERT INTO public.comments (id, post_id, author_profile_id, source, body) VALUES ($1, $2, $3, 'human', 'Likeable')`, [commentId, postId, first.id])
      await become(client, first.subject)
      await client.query('SELECT public.follow_profile($1,$2)', [author.id, randomUUID()])
      await client.query('SELECT public.like_post($1,$2)', [postId, randomUUID()])
      await client.query('SELECT public.bookmark_post($1)', [postId])
      await client.query('SELECT public.like_comment($1,$2)', [commentId, randomUUID()])
      const notificationId = randomUUID(); await client.query('SET LOCAL ROLE NONE'); await client.query(`INSERT INTO public.notifications (id, recipient_profile_id, kind) VALUES ($1, $2, 'follow')`, [notificationId, first.id])
      await become(client, second.subject)
      await expect(savepoint(client, () => client.query('DELETE FROM public.follows WHERE follower_profile_id = $1', [first.id]))).rejects.toThrow(/permission denied/)
      await expect(savepoint(client, () => client.query('DELETE FROM public.post_likes WHERE profile_id = $1', [first.id]))).rejects.toThrow(/permission denied/)
      await expect(savepoint(client, () => client.query('DELETE FROM public.bookmarks WHERE profile_id = $1', [first.id]))).rejects.toThrow(/permission denied/)
      await expect(savepoint(client, () => client.query('DELETE FROM public.comment_likes WHERE profile_id = $1', [first.id]))).rejects.toThrow(/permission denied/)
      await client.query('UPDATE public.notifications SET read_at = clock_timestamp() WHERE id = $1', [notificationId])
      await client.query('SET LOCAL ROLE NONE')
      expect((await client.query('SELECT count(*)::int AS count FROM public.follows WHERE follower_profile_id = $1', [first.id])).rows[0]?.count).toBe(1)
      expect((await client.query('SELECT count(*)::int AS count FROM public.post_likes WHERE profile_id = $1', [first.id])).rows[0]?.count).toBe(1)
      expect((await client.query('SELECT count(*)::int AS count FROM public.bookmarks WHERE profile_id = $1', [first.id])).rows[0]?.count).toBe(1)
      expect((await client.query('SELECT count(*)::int AS count FROM public.comment_likes WHERE profile_id = $1', [first.id])).rows[0]?.count).toBe(1)
      expect((await client.query('SELECT read_at FROM public.notifications WHERE id = $1', [notificationId])).rows[0]?.read_at).toBeNull()
    })
  })

  it('derives immutable root identity and enforces the hard 500-row group boundary',async()=>transaction(async client=>{
    const actor=await human(client),author=await ip(client),postId=await publishedPost(client,author.id),root=randomUUID(),forged=randomUUID(),reply=randomUUID()
    await client.query("INSERT INTO public.comments(id,post_id,root_comment_id,author_profile_id,source,body) VALUES($1,$2,$3,$4,'human','root')",[root,postId,forged,actor.id])
    await client.query("INSERT INTO public.comments(id,post_id,root_comment_id,parent_comment_id,author_profile_id,source,body) VALUES($1,$2,$3,$4,$5,'human','reply')",[reply,postId,forged,root,actor.id])
    await expect(client.query('SELECT id,root_comment_id FROM public.comments WHERE id=ANY($1::uuid[]) ORDER BY id',[ [root,reply] ])).resolves.toMatchObject({rows:expect.arrayContaining([{id:root,root_comment_id:root},{id:reply,root_comment_id:root}])})
    await expect(savepoint(client,()=>client.query('UPDATE public.comments SET root_comment_id=$1 WHERE id=$2',[reply,root]))).rejects.toThrow(/root is immutable|only be soft deleted/)
    await client.query("INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body) SELECT gen_random_uuid(),$1,$2,$3,'human','bounded' FROM generate_series(1,498)",[postId,root,actor.id])
    await expect(savepoint(client,()=>client.query("INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body) VALUES($1,$2,$3,$4,'human','overflow')",[randomUUID(),postId,root,actor.id]))).rejects.toThrow(/fanout limit/)
  }))

  it('denies direct comment relationship writes while granting only bounded commands',async()=>transaction(async client=>{
    const result=await client.query<{likes_insert:boolean;bookmarks_insert:boolean;shares_insert:boolean;like_command:boolean;share_command_anon:boolean}>(`SELECT has_table_privilege('aifans_authenticated','public.comment_likes','INSERT') likes_insert,has_table_privilege('aifans_authenticated','public.comment_bookmarks','INSERT') bookmarks_insert,has_table_privilege('aifans_anon','public.comment_share_events','INSERT') shares_insert,has_function_privilege('aifans_authenticated','public.like_comment(uuid,uuid)','EXECUTE') like_command,has_function_privilege('aifans_anon','public.record_comment_share(uuid,uuid)','EXECUTE') share_command_anon`)
    expect(result.rows[0]).toEqual({likes_insert:false,bookmarks_insert:false,shares_insert:false,like_command:true,share_command_anon:true})
  }))
  it('denies anonymous and authenticated callers raw comment rows and bodies',async()=>transaction(async client=>{
    const privileges=await client.query<{anon_select:boolean;authenticated_select:boolean;authenticated_insert:boolean}>(`SELECT has_column_privilege('aifans_anon','public.comments','body','SELECT') anon_select,has_column_privilege('aifans_authenticated','public.comments','body','SELECT') authenticated_select,has_table_privilege('aifans_authenticated','public.comments','INSERT') authenticated_insert`)
    expect(privileges.rows[0]).toEqual({anon_select:false,authenticated_select:false,authenticated_insert:false})
  }))

  it('exports the composite current-revision foreign key through Drizzle', () => {
    const foreignKeys = getTableConfig(ipProfiles).foreignKeys
    expect(foreignKeys.some((key) => key.getName() === 'ip_profiles_current_identity_revision_fk')).toBe(true)
  })
  it('exports threaded-comment checks and indexes through Drizzle',()=>{
    const commentConfig=getTableConfig(comments),bookmarkConfig=getTableConfig(commentBookmarks),notificationConfig=getTableConfig(notifications)
    expect(commentConfig.checks.map(item=>item.name)).toContain('comments_root_shape_check')
    expect(commentConfig.indexes.map(item=>item.config.name)).toEqual(expect.arrayContaining(['comments_post_root_created_idx','comments_post_root_cursor_idx']))
    expect(bookmarkConfig.indexes.map(item=>item.config.name)).toContain('comment_bookmarks_profile_created_idx')
    expect(notificationConfig.indexes.map(item=>item.config.name)).toContain('notifications_comment_like_once_idx')
  })
})
