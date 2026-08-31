import {Pool} from '@neondatabase/serverless'
import {
  type CommentCursor, type CreateHumanComment, CreateHumanCommentSchema, type Cursor,
  type FeedKind, type FeedPage, FeedPageSchema, type FeedPost, type FeedVisualType, type Locale,
  type NotificationPage, NotificationPageSchema, type PageQuery, type PostDetail,
  type PublicComment, type PublicIp, decodeCursor, decodeNotificationCursor,
  encodeNotificationCursor, type Cursor as SocialCursor,
  type CreateIpInput, CreateIpSchema, type CreatePostInput, CreatePostSchema,
  type CreateIpCommentInput, CreateIpCommentSchema, PublicIpSchema, FeedPostSchema,
  PublicCommentSchema,
} from '@aifans/contracts'
import {type Actor, type QueryClient, type QueryPool, type WithActor, type WithPlatformActor, withActor, withPlatformActor} from './session.js'

export type CommandContext = {requestId: string}

export type SocialRepository = {
  listFeed(input: {viewer: Actor | null; kind: FeedKind; visualType?: FeedVisualType; locale?: Locale; limit: number; after: Cursor | null}): Promise<FeedPage>
  getPost(input: {viewer: Actor | null; postId: string; commentLimit: number; commentAfter: CommentCursor | null}): Promise<PostDetail | null>
  follow(actor: Actor, targetProfileId: string, context: CommandContext): Promise<{created: boolean}>
  unfollow(actor: Actor, targetProfileId: string): Promise<{deleted: boolean}>
  likePost(actor: Actor, postId: string, context: CommandContext): Promise<{created: boolean}>
  unlikePost(actor: Actor, postId: string): Promise<{deleted: boolean}>
  bookmarkPost(actor: Actor, postId: string): Promise<{created: boolean}>
  unbookmarkPost(actor: Actor, postId: string): Promise<{deleted: boolean}>
  listBookmarks(actor: Actor, page: PageQuery): Promise<FeedPage>
  createHumanComment(actor: Actor, postId: string, input: CreateHumanComment, context: CommandContext): Promise<PublicComment>
  listNotifications(actor: Actor, page: PageQuery): Promise<NotificationPage>
  markNotificationRead(actor: Actor, notificationId: string): Promise<{readAt: string} | null>
}

export type PlatformSocialRepository = {
  createIp(input: {actor: Actor; requestId: string; ip: CreateIpInput}): Promise<PublicIp>
  publishPost(input: {actor: Actor; requestId: string; post: CreatePostInput}): Promise<FeedPost>
  publishIpComment(input: {actor: Actor; requestId: string; postId: string; comment: CreateIpCommentInput}): Promise<PublicComment>
}

type PublicSession = <T>(callback: (client: QueryClient) => Promise<T>) => Promise<T>
type PublicIpRow = {id: string; username: string; display_name: string; bio: string | null; languages: string[]; visual_type?: 'realistic' | 'anime' | 'hybrid'; creator_id?: string | null; creator_username?: string | null; creator_display_name?: string | null}
type PostRow = PublicIpRow & {post_id: string; body: string; language_code: string | null; published_at: Date | string; like_count: number | string; comment_count: number | string; viewer_has_liked?: boolean; viewer_has_bookmarked?: boolean; viewer_follows_author?: boolean; score?: number | string}
const publicPostSql = `SELECT p.post_id, p.body, p.language_code, p.published_at,
  p.id, p.username, p.display_name, p.bio, p.languages, p.visual_type,
  p.creator_id, p.creator_username, p.creator_display_name,
  metrics.like_count, metrics.comment_count,
  flags.viewer_has_liked, flags.viewer_has_bookmarked, flags.viewer_follows_author
  FROM public.social_public_posts() p
  CROSS JOIN LATERAL public.social_viewer_flags(p.post_id, p.author_profile_id) flags
  CROSS JOIN LATERAL public.social_post_metrics(p.post_id, p.author_profile_id, NULL::text) metrics`

function iso(value: Date | string): string { return new Date(value).toISOString() }
function publicIp(row: PublicIpRow): PublicIp {
  const creator = row.creator_id && row.creator_username && row.creator_display_name
    ? {id: row.creator_id, username: row.creator_username, displayName: row.creator_display_name}
    : undefined
  return {kind:'ip', id: row.id, username: row.username, displayName: row.display_name, bio: row.bio, languages: row.languages as Locale[], visualType: row.visual_type ?? 'hybrid', ...(creator ? {creator} : {})}
}
function post(row: PostRow): FeedPost { return {id: row.post_id, body: row.body, languageCode: row.language_code, publishedAt: iso(row.published_at), author: publicIp(row), likeCount: Number(row.like_count), commentCount: Number(row.comment_count), ...(row.viewer_has_liked === undefined ? {} : {viewerHasLiked: row.viewer_has_liked, viewerHasBookmarked: row.viewer_has_bookmarked ?? false, viewerFollowsAuthor: row.viewer_follows_author ?? false})} }

function defaultPublicSession(pool: QueryPool): PublicSession {
  return async (callback) => { const client = await pool.connect(); try { await client.query('BEGIN'); await client.query('SET LOCAL ROLE aifans_anon'); const result = await callback(client); await client.query('COMMIT'); return result } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() } }
}

let pool: Pool | undefined
function defaultPool(): Pool { pool ??= new Pool({connectionString: process.env.DATABASE_USER_URL}); return pool }
function actorId(client: QueryClient): Promise<string> { return client.query<{id: string}>('SELECT public.current_profile_id() AS id').then((result) => { if (!result.rows[0]?.id) throw new Error('FORBIDDEN'); return result.rows[0].id }) }

export function createSocialRepository({withActor: runWithActor = withActor, withPublic = defaultPublicSession(defaultPool())}: {withActor?: WithActor; withPublic?: PublicSession} = {}): SocialRepository {
  async function read<T>(viewer: Actor | null, callback: (client: QueryClient) => Promise<T>): Promise<T> { return viewer ? runWithActor(viewer, callback) : withPublic(callback) }
  async function feed(client: QueryClient, input: {kind: FeedKind; visualType?: FeedVisualType; locale?: Locale; limit: number; after: Cursor | null}, bookmarkedOnly = false): Promise<FeedPage> {
    const after = input.after
    const params: unknown[] = [input.locale ?? null]
    const filters = ['TRUE']
    const visualType = input.visualType ?? 'all'
    if (visualType !== 'all') { params.push(visualType); filters.push(`p.visual_type = $${params.length}::public.creator_visual_type`) }
    if (input.kind === 'following' && !bookmarkedOnly) filters.push('public.social_viewer_follows(p.author_profile_id)')
    if (bookmarkedOnly) filters.push('EXISTS (SELECT 1 FROM public.bookmarks saved WHERE saved.profile_id = public.current_profile_id() AND saved.post_id = p.post_id)')
    if (after?.kind === 'chronological') { params.push(after.publishedAt, after.id); filters.push(`(p.published_at, p.post_id) < (public.social_public_post_anchor($${params.length}::uuid, $${params.length - 1}::timestamptz), $${params.length}::uuid)`) }
    // Stable public score: IP weight + locale match + actual likes/comments. Published time and id break ties.
    const score = `metrics.score`
    if (after?.kind === 'for_you') { params.push(after.score, after.publishedAt, after.id); filters.push(`(${score}, p.published_at, p.post_id) < ($${params.length - 2}, public.social_public_post_anchor($${params.length}::uuid, $${params.length - 1}::timestamptz), $${params.length}::uuid)`) }
    params.push(input.limit + 1)
    const order = input.kind === 'for_you' ? `${score} DESC, p.published_at DESC, p.post_id DESC` : 'p.published_at DESC, p.post_id DESC'
    const result = await client.query<PostRow>(`${publicPostSql.replace('NULL::text', '$1::text').replace(' FROM public.social_public_posts() p', `, ${score} AS score FROM public.social_public_posts() p`)} WHERE ${filters.join(' AND ')} ORDER BY ${order} LIMIT $${params.length}`, params)
    const rows = result.rows.slice(0, input.limit)
    const last = rows.at(-1)
    const nextCursor = result.rows.length > input.limit && last ? Buffer.from(JSON.stringify(input.kind === 'for_you' ? {v: 1, kind: 'for_you', score: Number(last.score ?? 0), publishedAt: iso(last.published_at), id: last.post_id} : {v: 1, kind: 'chronological', publishedAt: iso(last.published_at), id: last.post_id}), 'utf8').toString('base64url') : null
    return FeedPageSchema.parse({items: rows.map(post), nextCursor})
  }
  return {
    listFeed: (input) => { if (input.kind === 'following' && input.viewer === null) return Promise.reject(new Error('AUTH_REQUIRED')); return read(input.viewer, (client) => feed(client, input)) },
    async getPost(input) { return read(input.viewer, async (client) => { const result = await client.query<PostRow>(`${publicPostSql} WHERE p.post_id = $1`, [input.postId]); const base = result.rows[0]; if (!base) return null; const after=input.commentAfter; const rows=await client.query<{id:string;post_id:string;parent_comment_id:string|null;author_id:string;author_kind:'human'|'ip';username:string;display_name:string;body:string;state:'published'|'deleted';created_at:Date|string;visual_type:'realistic'|'anime'|'hybrid'|null;creator_id:string|null;creator_username:string|null;creator_display_name:string|null}>('SELECT * FROM public.social_public_comments($1,$2,$3,$4)',[input.postId,after?.createdAt??null,after?.id??null,input.commentLimit+1]); const items=rows.rows.slice(0,input.commentLimit).map(r=>({id:r.id,postId:r.post_id,parentCommentId:r.parent_comment_id,author:r.author_kind==='human'?{kind:'human' as const,id:r.author_id,username:r.username,displayName:r.display_name}:publicIp({id:r.author_id,username:r.username,display_name:r.display_name,bio:null,languages:[],visual_type:r.visual_type??'hybrid',creator_id:r.creator_id,creator_username:r.creator_username,creator_display_name:r.creator_display_name}),state:r.state,...(r.state==='published'?{body:r.body}:{}),createdAt:iso(r.created_at)})); const last=items.at(-1); return {...post(base),comments:{items,nextCursor:rows.rows.length>input.commentLimit&&last?Buffer.from(JSON.stringify({v:1,kind:'comments',createdAt:last.createdAt,id:last.id}),'utf8').toString('base64url'):null}} }) },
    follow: (actor, targetProfileId, context) => runWithActor(actor, async (client) => ({created: (await client.query<{created: boolean}>('SELECT public.follow_profile($1,$2) AS created', [targetProfileId, context.requestId])).rows[0]?.created === true})),
    unfollow: (actor, targetProfileId) => runWithActor(actor, async (client) => ({deleted: (await client.query<{deleted:boolean}>('SELECT public.unfollow_profile($1) AS deleted',[targetProfileId])).rows[0]?.deleted === true})),
    likePost: (actor, postId, context) => runWithActor(actor, async (client) => ({created: (await client.query<{created: boolean}>('SELECT public.like_post($1,$2) AS created', [postId, context.requestId])).rows[0]?.created === true})),
    unlikePost: (actor, postId) => runWithActor(actor, async (client) => ({deleted: (await client.query<{deleted:boolean}>('SELECT public.unlike_post($1) AS deleted',[postId])).rows[0]?.deleted === true})),
    bookmarkPost: (actor, postId) => runWithActor(actor, async (client) => ({created: (await client.query<{created:boolean}>('SELECT public.bookmark_post($1) AS created',[postId])).rows[0]?.created === true})),
    unbookmarkPost: (actor, postId) => runWithActor(actor, async (client) => ({deleted: (await client.query<{deleted:boolean}>('SELECT public.unbookmark_post($1) AS deleted',[postId])).rows[0]?.deleted === true})),
    listBookmarks: (actor, page) => runWithActor(actor, (client) => feed(client, {kind: 'following', visualType: 'all', limit: page.limit, after: page.cursor ? decodeCursor(page.cursor, 'following') : null}, true)),
    async createHumanComment(actor, postId, input, context) { const value = CreateHumanCommentSchema.parse(input); return runWithActor(actor, async (client) => { const authorId = await actorId(client); const inserted = await client.query<{id: string; created_at: Date | string}>('SELECT id,created_at FROM public.create_human_comment($1,$2,$3,$4)', [postId, value.parentCommentId ?? null, value.body, context.requestId]); const created = inserted.rows[0]; if (!created) throw new Error('COMMENT_INVALID'); const me = await client.query<{id:string;username:string;display_name:string}>('SELECT id,username,display_name FROM public.profiles WHERE id=$1', [authorId]); const author=me.rows[0]; if (!author) throw new Error('FORBIDDEN'); return {id: created.id, postId, parentCommentId: value.parentCommentId ?? null, author: {kind:'human', id:author.id, username:author.username, displayName:author.display_name}, state: 'published', body: value.body, createdAt: iso(created.created_at)} }) },
    async listNotifications(actor, page) { return runWithActor(actor, async (client) => { const afterId = page.cursor ? decodeNotificationCursor(page.cursor).id : null; const result = await client.query<{id: string; kind: 'follow' | 'post_like' | 'comment' | 'reply' | 'comment_like'; post_id: string | null; comment_id: string | null; created_at: Date | string; read_at: Date | string | null; actor_id: string | null; actor_kind: 'human' | 'ip' | null; username: string | null; display_name: string | null; bio: string | null; languages: string[] | null;visual_type:'realistic'|'anime'|'hybrid'|null;creator_id:string|null;creator_username:string|null;creator_display_name:string|null}>('SELECT * FROM public.social_my_notifications($1,$2)', [afterId, page.limit + 1]); const rows=result.rows.slice(0,page.limit); const last=rows.at(-1); return NotificationPageSchema.parse({items: rows.map((row) => { const actor = !row.actor_id || !row.actor_kind || !row.username || !row.display_name ? null : row.actor_kind === 'human' ? {kind: 'human' as const, id: row.actor_id, username: row.username, displayName: row.display_name} : publicIp({id:row.actor_id,username:row.username,display_name:row.display_name,bio:row.bio,languages:row.languages??[],visual_type:row.visual_type??'hybrid',creator_id:row.creator_id,creator_username:row.creator_username,creator_display_name:row.creator_display_name}); return {id: row.id, kind: row.kind, actor, postId: row.post_id, commentId: row.comment_id, createdAt: iso(row.created_at), readAt: row.read_at ? iso(row.read_at) : null} }), nextCursor: result.rows.length>page.limit&&last ? encodeNotificationCursor({v:1,kind:'notifications',createdAt:iso(last.created_at),id:last.id}) : null}) }) },
    async markNotificationRead(actor, notificationId) { return runWithActor(actor, async (client) => { const updated = await client.query<{read_at: Date | string}>('UPDATE public.notifications SET read_at=clock_timestamp() WHERE id=$1 AND read_at IS NULL RETURNING read_at', [notificationId]); if (updated.rows[0]) return {readAt: iso(updated.rows[0].read_at)}; const current = await client.query<{read_at: Date | string | null}>('SELECT read_at FROM public.notifications WHERE id=$1', [notificationId]); return current.rows[0]?.read_at ? {readAt: iso(current.rows[0].read_at)} : null }) },
  }
}

export type {SocialCursor}

type PlatformPostRow = PostRow
type PlatformCommentRow = PublicIpRow & {
  comment_id: string
  post_id: string
  parent_comment_id: string | null
  body: string
  created_at: Date | string
}

export function createPlatformSocialRepository(
  {withPlatformActor: runWithPlatformActor = withPlatformActor}: {withPlatformActor?: WithPlatformActor} = {},
): PlatformSocialRepository {
  return {
    async createIp(input) {
      const value = CreateIpSchema.parse(input.ip)
      return runWithPlatformActor(input.actor, async (client) => {
        const result = await client.query<PublicIpRow>(
          'SELECT * FROM public.platform_create_ip($1,$2,$3,$4,$5)',
          [value.username, value.displayName, value.bio ?? null, value.languageCodes ?? [], input.requestId],
        )
        const created = result.rows[0]
        if (!created) throw new Error('IP_NOT_PUBLISHABLE')
        return PublicIpSchema.parse(publicIp(created))
      })
    },
    async publishPost(input) {
      const value = CreatePostSchema.parse(input.post)
      return runWithPlatformActor(input.actor, async (client) => {
        const result = await client.query<PlatformPostRow>(
          'SELECT * FROM public.platform_publish_post($1,$2,$3,$4)',
          [value.ipProfileId, value.body, value.languageCode ?? null, input.requestId],
        )
        const created = result.rows[0]
        if (!created) throw new Error('IP_NOT_PUBLISHABLE')
        return FeedPostSchema.parse(post(created))
      })
    },
    async publishIpComment(input) {
      const value = CreateIpCommentSchema.parse(input.comment)
      return runWithPlatformActor(input.actor, async (client) => {
        const result = await client.query<PlatformCommentRow>(
          'SELECT * FROM public.platform_publish_ip_comment($1,$2,$3,$4,$5)',
          [input.postId, value.ipProfileId, value.body, value.parentCommentId ?? null, input.requestId],
        )
        const created = result.rows[0]
        if (!created) throw new Error('COMMENT_INVALID')
        return PublicCommentSchema.parse({
          id: created.comment_id,
          postId: created.post_id,
          parentCommentId: created.parent_comment_id,
          author: publicIp(created),
          state: 'published',
          body: created.body,
          createdAt: iso(created.created_at),
        })
      })
    },
  }
}
