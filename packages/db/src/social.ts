import {randomUUID} from 'node:crypto'
import {Pool} from '@neondatabase/serverless'
import {
  type CommentCursor, type CreateHumanComment, CreateHumanCommentSchema, type Cursor,
  type FeedKind, type FeedPage, FeedPageSchema, type FeedPost, type Locale,
  type NotificationPage, NotificationPageSchema, type PageQuery, type PostDetail,
  type PublicComment, type PublicIp, decodeCursor, type Cursor as SocialCursor,
} from '@aifans/contracts'
import {type Actor, type QueryClient, type QueryPool, type WithActor, withActor} from './session.js'

export type SocialRepository = {
  listFeed(input: {viewer: Actor | null; kind: FeedKind; locale?: Locale; limit: number; after: Cursor | null}): Promise<FeedPage>
  getPost(input: {viewer: Actor | null; postId: string; commentLimit: number; commentAfter: CommentCursor | null}): Promise<PostDetail | null>
  follow(actor: Actor, targetProfileId: string): Promise<{created: boolean}>
  unfollow(actor: Actor, targetProfileId: string): Promise<{deleted: boolean}>
  likePost(actor: Actor, postId: string): Promise<{created: boolean}>
  unlikePost(actor: Actor, postId: string): Promise<{deleted: boolean}>
  bookmarkPost(actor: Actor, postId: string): Promise<{created: boolean}>
  unbookmarkPost(actor: Actor, postId: string): Promise<{deleted: boolean}>
  listBookmarks(actor: Actor, page: PageQuery): Promise<FeedPage>
  createHumanComment(actor: Actor, postId: string, input: CreateHumanComment): Promise<PublicComment>
  listNotifications(actor: Actor, page: PageQuery): Promise<NotificationPage>
  markNotificationRead(actor: Actor, notificationId: string): Promise<{readAt: string} | null>
}

type PublicSession = <T>(callback: (client: QueryClient) => Promise<T>) => Promise<T>
type PublicIpRow = {id: string; username: string; display_name: string; bio: string | null; languages: string[]}
type PostRow = PublicIpRow & {post_id: string; body: string; language_code: string | null; published_at: Date | string; like_count: number | string; comment_count: number | string; viewer_has_liked?: boolean; viewer_has_bookmarked?: boolean; viewer_follows_author?: boolean; score?: number | string}
const publicPostSql = `SELECT p.post_id, p.body, p.language_code, p.published_at,
  p.id, p.username, p.display_name, p.bio, p.languages,
  metrics.like_count, metrics.comment_count,
  flags.viewer_has_liked, flags.viewer_has_bookmarked, flags.viewer_follows_author
  FROM public.social_public_posts() p
  CROSS JOIN LATERAL public.social_viewer_flags(p.post_id, p.author_profile_id) flags
  CROSS JOIN LATERAL public.social_post_metrics(p.post_id, p.author_profile_id, NULL::text) metrics`

function iso(value: Date | string): string { return new Date(value).toISOString() }
function publicIp(row: PublicIpRow): PublicIp { return {kind:'ip', id: row.id, username: row.username, displayName: row.display_name, bio: row.bio, languages: row.languages as Locale[]} }
function post(row: PostRow): FeedPost { return {id: row.post_id, body: row.body, languageCode: row.language_code, publishedAt: iso(row.published_at), author: publicIp(row), likeCount: Number(row.like_count), commentCount: Number(row.comment_count), ...(row.viewer_has_liked === undefined ? {} : {viewerHasLiked: row.viewer_has_liked, viewerHasBookmarked: row.viewer_has_bookmarked ?? false, viewerFollowsAuthor: row.viewer_follows_author ?? false})} }

function defaultPublicSession(pool: QueryPool): PublicSession {
  return async (callback) => { const client = await pool.connect(); try { await client.query('BEGIN'); await client.query('SET LOCAL ROLE aifans_anon'); const result = await callback(client); await client.query('COMMIT'); return result } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() } }
}

let pool: Pool | undefined
function defaultPool(): Pool { pool ??= new Pool({connectionString: process.env.DATABASE_USER_URL}); return pool }
function actorId(client: QueryClient): Promise<string> { return client.query<{id: string}>('SELECT public.current_profile_id() AS id').then((result) => { if (!result.rows[0]?.id) throw new Error('FORBIDDEN'); return result.rows[0].id }) }

export function createSocialRepository({withActor: runWithActor = withActor, withPublic = defaultPublicSession(defaultPool())}: {withActor?: WithActor; withPublic?: PublicSession} = {}): SocialRepository {
  async function read<T>(viewer: Actor | null, callback: (client: QueryClient) => Promise<T>): Promise<T> { return viewer ? runWithActor(viewer, callback) : withPublic(callback) }
  async function feed(client: QueryClient, input: {kind: FeedKind; locale?: Locale; limit: number; after: Cursor | null}, bookmarkedOnly = false): Promise<FeedPage> {
    const after = input.after
    const params: unknown[] = [input.locale ?? null]
    const filters = ['TRUE']
    if (input.kind === 'following' && !bookmarkedOnly) filters.push('public.social_viewer_follows(p.author_profile_id)')
    if (bookmarkedOnly) filters.push('EXISTS (SELECT 1 FROM public.bookmarks saved WHERE saved.profile_id = public.current_profile_id() AND saved.post_id = p.id)')
    if (after?.kind === 'chronological') { params.push(after.publishedAt, after.id); filters.push(`(p.published_at, p.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`) }
    // Stable public score: IP weight + locale match + actual likes/comments. Published time and id break ties.
    const score = `metrics.score`
    if (after?.kind === 'for_you') { params.push(after.score, after.publishedAt, after.id); filters.push(`(${score}, p.published_at, p.id) < ($${params.length - 2}, $${params.length - 1}::timestamptz, $${params.length}::uuid)`) }
    params.push(input.limit + 1)
    const order = input.kind === 'for_you' ? `${score} DESC, p.published_at DESC, p.id DESC` : 'p.published_at DESC, p.id DESC'
    const result = await client.query<PostRow>(`${publicPostSql.replace('NULL::text', '$1::text').replace(' FROM public.social_public_posts() p', `, ${score} AS score FROM public.social_public_posts() p`)} WHERE ${filters.join(' AND ')} ORDER BY ${order} LIMIT $${params.length}`, params)
    const rows = result.rows.slice(0, input.limit)
    const last = rows.at(-1)
    const nextCursor = result.rows.length > input.limit && last ? Buffer.from(JSON.stringify(input.kind === 'for_you' ? {v: 1, kind: 'for_you', score: Number(last.score ?? 0), publishedAt: iso(last.published_at), id: last.post_id} : {v: 1, kind: 'chronological', publishedAt: iso(last.published_at), id: last.post_id}), 'utf8').toString('base64url') : null
    return FeedPageSchema.parse({items: rows.map(post), nextCursor})
  }
  async function mutation(actor: Actor, text: string, values: unknown[]): Promise<boolean> { return runWithActor(actor, async (client) => (await client.query(text, values)).rowCount === 1) }
  return {
    listFeed: (input) => { if (input.kind === 'following' && input.viewer === null) return Promise.reject(new Error('AUTH_REQUIRED')); return read(input.viewer, (client) => feed(client, input)) },
    async getPost(input) { return read(input.viewer, async (client) => { const result = await client.query<PostRow>(`${publicPostSql} WHERE p.post_id = $1`, [input.postId]); const base = result.rows[0]; if (!base) return null; return {...post(base), comments:{items:[],nextCursor:null}} }) },
    follow: (actor, targetProfileId) => runWithActor(actor, async (client) => ({created: (await client.query<{created: boolean}>('SELECT public.follow_profile($1,$2,$3,$4) AS created', [targetProfileId, randomUUID(), randomUUID(), 'api'])).rows[0]?.created === true})),
    unfollow: (actor, targetProfileId) => mutation(actor, 'DELETE FROM public.follows WHERE follower_profile_id=public.current_profile_id() AND followed_profile_id=$1 RETURNING follower_profile_id', [targetProfileId]).then((deleted) => ({deleted})),
    likePost: (actor, postId) => runWithActor(actor, async (client) => ({created: (await client.query<{created: boolean}>('SELECT public.like_post($1,$2,$3,$4) AS created', [postId, randomUUID(), randomUUID(), 'api'])).rows[0]?.created === true})),
    unlikePost: (actor, postId) => mutation(actor, 'DELETE FROM public.post_likes WHERE post_id=$1 AND profile_id=public.current_profile_id() RETURNING post_id', [postId]).then((deleted) => ({deleted})),
    bookmarkPost: (actor, postId) => mutation(actor, 'INSERT INTO public.bookmarks (post_id,profile_id) VALUES ($1,public.current_profile_id()) ON CONFLICT DO NOTHING RETURNING post_id', [postId]).then((created) => ({created})),
    unbookmarkPost: (actor, postId) => mutation(actor, 'DELETE FROM public.bookmarks WHERE post_id=$1 AND profile_id=public.current_profile_id() RETURNING post_id', [postId]).then((deleted) => ({deleted})),
    listBookmarks: (actor, page) => runWithActor(actor, (client) => feed(client, {kind: 'following', limit: page.limit, after: page.cursor ? decodeCursor(page.cursor, 'following') : null}, true)),
    async createHumanComment(actor, postId, input) { const value = CreateHumanCommentSchema.parse(input); return runWithActor(actor, async (client) => { const authorId = await actorId(client); const id = randomUUID(); const inserted = await client.query<{id: string; created_at: Date | string}>('SELECT id,created_at FROM public.create_human_comment($1,$2,$3,$4,$5,$6,$7)', [id, postId, value.parentCommentId ?? null, value.body, randomUUID(), randomUUID(), 'api']); if (!inserted.rows[0]) throw new Error('COMMENT_INVALID'); const me = await client.query<PublicIpRow>('SELECT id,username,display_name,bio,ARRAY[]::text[] AS languages FROM public.profiles WHERE id=$1', [authorId]); return {id, postId, parentCommentId: value.parentCommentId ?? null, author: publicIp(me.rows[0]!), state: 'published', body: value.body, createdAt: iso(inserted.rows[0].created_at)} }) },
    async listNotifications(actor, page) { return runWithActor(actor, async (client) => { let after: {createdAt: string; id: string} | null = null; if (page.cursor) { try { const value = JSON.parse(Buffer.from(page.cursor, 'base64url').toString('utf8')) as {v?: number; kind?: string; createdAt?: string; id?: string}; if (value.v !== 1 || value.kind !== 'notifications' || typeof value.createdAt !== 'string' || typeof value.id !== 'string') throw new Error(); after = {createdAt: value.createdAt, id: value.id} } catch { throw new Error('INVALID_CURSOR') } }; const values: unknown[] = []; const filter = after ? (values.push(after.createdAt, after.id), 'WHERE (n.created_at,n.id) < ($1::timestamptz,$2::uuid)') : ''; values.push(page.limit + 1); const result = await client.query<{id: string; kind: 'follow' | 'post_like' | 'comment' | 'reply' | 'comment_like'; post_id: string | null; comment_id: string | null; created_at: Date | string; read_at: Date | string | null; actor_id: string | null; username: string | null; display_name: string | null; bio: string | null; languages: string[] | null}>(`SELECT n.id,n.kind,n.post_id,n.comment_id,n.created_at,n.read_at,p.id AS actor_id,p.username,COALESCE(r.display_name,p.display_name) AS display_name,COALESCE(r.bio,p.bio) AS bio,COALESCE(r.languages,ARRAY[]::text[]) AS languages FROM public.notifications n LEFT JOIN public.profiles p ON p.id=n.actor_profile_id LEFT JOIN public.ip_profiles ip ON ip.profile_id=p.id LEFT JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id ${filter} ORDER BY n.created_at DESC,n.id DESC LIMIT $${values.length}`, values); const rows=result.rows.slice(0,page.limit); const last=rows.at(-1); return NotificationPageSchema.parse({items: rows.map((row) => ({id: row.id, kind: row.kind, actor: row.actor_id && row.username && row.display_name ? {id: row.actor_id, username: row.username, displayName: row.display_name, bio: row.bio, languages: (row.languages ?? []) as Locale[]} : null, postId: row.post_id, commentId: row.comment_id, createdAt: iso(row.created_at), readAt: row.read_at ? iso(row.read_at) : null})), nextCursor: result.rows.length>page.limit&&last ? Buffer.from(JSON.stringify({v:1,kind:'notifications',createdAt:iso(last.created_at),id:last.id}),'utf8').toString('base64url') : null}) }) },
    async markNotificationRead(actor, notificationId) { return runWithActor(actor, async (client) => { const current = await client.query<{read_at: Date | string | null}>('SELECT read_at FROM public.notifications WHERE id=$1', [notificationId]); if (!current.rows[0]) return null; if (current.rows[0].read_at) return {readAt: iso(current.rows[0].read_at)}; const result = await client.query<{read_at: Date | string}>('UPDATE public.notifications SET read_at=clock_timestamp() WHERE id=$1 AND read_at IS NULL RETURNING read_at', [notificationId]); return result.rows[0] ? {readAt: iso(result.rows[0].read_at)} : null }) },
  }
}

export type {SocialCursor}
