import {
  CommentCursorSchema,
  CreateHumanCommentSchema,
  FeedPageSchema,
  FeedQuerySchema,
  NotificationPageSchema,
  PageQuerySchema,
  PostDetailSchema,
  PublicCommentSchema,
  PublicIpProfileSchema,
  decodeCursor,
  decodeNotificationCursor,
} from '@aifans/contracts'
import type {Actor} from '@aifans/db'
import type {Context, Hono} from 'hono'
import {z} from 'zod'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ProfilePort} from '../ports/profiles.js'
import type {MutationContext, SocialPort} from '../ports/social.js'

type SocialDependencies = {
  auth?: AuthVerifier
  profiles?: ProfilePort
  social?: SocialPort
}

type ApiContext = Context<{Variables: ApiVariables}>
type ActorResolution = {ok: true; actor: Actor | null} | {ok: false; response: Response}

const IdParameterSchema = z.uuid()
const EmptyBodySchema = z.strictObject({})
const EmptyQuerySchema = z.strictObject({})
const PostQuerySchema = z.strictObject({
  commentLimit: z.coerce.number().int().min(1).max(50).default(25),
  commentCursor: z.string().min(1).optional(),
})
const CreatedSchema = z.strictObject({created: z.boolean()})
const DeletedSchema = z.strictObject({deleted: z.boolean()})
const NotificationReadSchema = z.strictObject({readAt: z.iso.datetime()})
const COMMENT_BODY_LIMIT=8192

const invalidRequest = (c: ApiContext) => apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
const invalidCursor = (c: ApiContext) => apiError(c, 400, 'INVALID_CURSOR', 'Cursor is invalid')

function safeQuery(c: ApiContext): Record<string, string> | null {
  const entries = new URL(c.req.url).searchParams.entries()
  const query: Array<[string, string]> = []
  const keys = new Set<string>()
  for (const entry of entries) {
    if (keys.has(entry[0])) return null
    keys.add(entry[0])
    query.push(entry)
  }
  return Object.fromEntries(query)
}

function parseId(value: string | undefined): string | null {
  const parsed = IdParameterSchema.safeParse(value)
  if (!parsed.success) return null
  return parsed.data
}

function declaredBodyTooLarge(request: Request,limit:number): boolean {
  const value=request.headers.get('content-length')
  return value!==null&&(!/^\d+$/.test(value)||Number(value)>limit)
}

async function readBoundedBody(request:Request,limit:number):Promise<string> {
  if(declaredBodyTooLarge(request,limit)) throw new Error('BODY_TOO_LARGE')
  if(!request.body) return ''
  const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0
  try { for(;;){const {done,value}=await reader.read();if(done)break;if(value){size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error('BODY_TOO_LARGE')}chunks.push(value)}} } finally { reader.releaseLock() }
  const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength}return new TextDecoder().decode(joined)
}

async function parseEmptyBody(c: ApiContext): Promise<boolean> {
  const text = await c.req.text()
  if (!text.trim()) return true
  try {
    return EmptyBodySchema.safeParse(JSON.parse(text)).success
  } catch {
    return false
  }
}

function hasDuplicateTopLevelJsonKey(text: string): boolean {
  const keys=new Set<string>();let depth=0
  for(let index=0;index<text.length;index++){const char=text[index];if(char==='"'){const start=index;for(index++;index<text.length;index++){if(text[index]==='\\')index++;else if(text[index]==='"')break}if(depth===1){let after=index+1;while(/\s/.test(text[after]??''))after++;if(text[after]===':'){let key:unknown;try{key=JSON.parse(text.slice(start,index+1))}catch{return true}if(typeof key==='string'){if(keys.has(key))return true;keys.add(key)}}}continue}if(char==='{')depth++;else if(char==='}')depth--}
  return false
}

function decodeCommentCursor(value: string): z.infer<typeof CommentCursorSchema> {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('INVALID_CURSOR')
    return CommentCursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')))
  } catch {
    throw new Error('INVALID_CURSOR')
  }
}

async function resolveActor(
  c: ApiContext,
  {auth, profiles}: SocialDependencies,
  required: boolean,
): Promise<ActorResolution> {
  if (!auth) {
    return required
      ? {ok: false, response: apiError(c, 503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured')}
      : {ok: true, actor: null}
  }

  const result = await auth.verify(c.req.raw)
  if (result.status === 'missing') {
    return required
      ? {ok: false, response: apiError(c, 401, 'AUTH_REQUIRED', 'Authentication is required')}
      : {ok: true, actor: null}
  }
  if (result.status === 'invalid' || !result.identity.subject.trim()) {
    return {ok: false, response: apiError(c, 401, 'AUTH_INVALID', 'Authentication is invalid')}
  }
  if (!profiles) {
    return {ok: false, response: apiError(c, 503, 'PROFILE_NOT_CONFIGURED', 'Profiles are not configured')}
  }

  await profiles.ensureHumanProfile({
    authSubject: result.identity.subject,
    ...(result.identity.email === undefined ? {} : {email: result.identity.email}),
    ...(result.identity.displayName === undefined ? {} : {displayName: result.identity.displayName}),
  })
  const account = await profiles.getCurrentAccount({subject: result.identity.subject})
  if (account === null) {
    return {ok: false, response: apiError(c, 500, 'PROFILE_NOT_AVAILABLE', 'Profile is not available')}
  }
  if (account.kind !== 'human') {
    return {ok: false, response: apiError(c, 403, 'HUMAN_REQUIRED', 'A human account is required')}
  }

  return {ok: true, actor: {subject: result.identity.subject}}
}

type NotFoundCode = 'POST_NOT_FOUND' | 'PROFILE_NOT_FOUND' | 'NOTIFICATION_NOT_FOUND'
type SocialErrorContext = {notFound?: NotFoundCode; comment?: boolean}

function errorProperty(error: unknown, property: 'code' | 'message'): string | undefined {
  if (typeof error !== 'object' || error === null || !(property in error)) return undefined
  const value = error[property as keyof typeof error]
  return typeof value === 'string' ? value : undefined
}

function notFound(c: ApiContext, code: NotFoundCode): Response {
  switch (code) {
    case 'POST_NOT_FOUND':
      return apiError(c, 404, code, 'Post not found')
    case 'PROFILE_NOT_FOUND':
      return apiError(c, 404, code, 'Profile not found')
    case 'NOTIFICATION_NOT_FOUND':
      return apiError(c, 404, code, 'Notification not found')
  }
}

function knownSocialError(c: ApiContext, error: unknown, context: SocialErrorContext = {}): Response {
  const code = errorProperty(error, 'code')
  const message = errorProperty(error, 'message')
  switch (message) {
    case 'INVALID_CURSOR':
      return invalidCursor(c)
    case 'POST_NOT_FOUND':
      return notFound(c, 'POST_NOT_FOUND')
    case 'PROFILE_NOT_FOUND':
      return notFound(c, 'PROFILE_NOT_FOUND')
    case 'NOTIFICATION_NOT_FOUND':
      return notFound(c, 'NOTIFICATION_NOT_FOUND')
    case 'COMMENT_INVALID':
      return apiError(c, 422, 'COMMENT_INVALID', 'Comment is invalid')
    case 'FORBIDDEN':
      return apiError(c, 403, 'FORBIDDEN', 'Action is not allowed')
  }
  if (code === 'INVALID_CURSOR') return invalidCursor(c)
  if (code === 'P0002' && context.notFound) return notFound(c, context.notFound)
  if (code === '42501') return apiError(c, 403, 'FORBIDDEN', 'Action is not allowed')
  if (context.comment && (code === '23503' || code === '23514' || code === 'P0001')) {
    return apiError(c, 422, 'COMMENT_INVALID', 'Comment is invalid')
  }
  throw error
}

function socialUnavailable(c: ApiContext, social?: SocialPort): Response | null {
  return social ? null : apiError(c, 503, 'SOCIAL_NOT_CONFIGURED', 'Social features are not configured')
}

export function registerSocialRoutes(app: Hono<{Variables: ApiVariables}>, dependencies: SocialDependencies) {
  app.get('/v1/feed', async (c) => {
    const unavailable = socialUnavailable(c, dependencies.social)
    if (unavailable) return unavailable
    const rawQuery = safeQuery(c)
    if (rawQuery === null) return invalidRequest(c)
    const query = FeedQuerySchema.safeParse(rawQuery)
    if (!query.success) return invalidRequest(c)

    let after = null
    if (query.data.cursor) {
      try {
        after = decodeCursor(query.data.cursor, query.data.kind)
      } catch {
        return invalidCursor(c)
      }
    }
    const actor = await resolveActor(c, dependencies, query.data.kind === 'following')
    if (!actor.ok) return actor.response

    try {
      const result = await dependencies.social!.listFeed({
        viewer: actor.actor,
        kind: query.data.kind,
        visualType: query.data.visualType,
        ...(query.data.locale === undefined ? {} : {locale: query.data.locale}),
        limit: query.data.limit,
        after,
      })
      return c.json(FeedPageSchema.parse(result), 200)
    } catch (error) {
      return knownSocialError(c, error)
    }
  })

  app.get('/v1/posts/:postId', async (c) => {
    const unavailable = socialUnavailable(c, dependencies.social)
    if (unavailable) return unavailable
    const postId = parseId(c.req.param('postId'))
    if (!postId) return invalidRequest(c)
    const rawQuery = safeQuery(c)
    if (rawQuery === null) return invalidRequest(c)
    const query = PostQuerySchema.safeParse(rawQuery)
    if (!query.success) return invalidRequest(c)

    let commentAfter = null
    if (query.data.commentCursor) {
      try {
        commentAfter = decodeCommentCursor(query.data.commentCursor)
      } catch {
        return invalidCursor(c)
      }
    }
    const actor = await resolveActor(c, dependencies, false)
    if (!actor.ok) return actor.response

    try {
      const result = await dependencies.social!.getPost({
        viewer: actor.actor,
        postId,
        commentLimit: query.data.commentLimit,
        commentAfter,
      })
      if (result === null) return apiError(c, 404, 'POST_NOT_FOUND', 'Post not found')
      return c.json(PostDetailSchema.parse(result), 200)
    } catch (error) {
      return knownSocialError(c, error)
    }
  })

  app.get('/v1/profiles/:profileId', async (c) => {
    const unavailable = socialUnavailable(c, dependencies.social)
    if (unavailable) return unavailable
    const profileId = parseId(c.req.param('profileId'))
    const rawQuery = safeQuery(c)
    if (!profileId || rawQuery === null) return invalidRequest(c)
    const query = PageQuerySchema.safeParse(rawQuery)
    if (!query.success) return invalidRequest(c)
    let after = null
    if (query.data.cursor) {
      try { after = decodeCursor(query.data.cursor, 'following') } catch { return invalidCursor(c) }
    }
    const actor = await resolveActor(c, dependencies, false)
    if (!actor.ok) return actor.response
    try {
      const result = await dependencies.social!.getPublicProfile({viewer:actor.actor,profileId,limit:query.data.limit,after})
      if (!result) return notFound(c,'PROFILE_NOT_FOUND')
      return c.json(PublicIpProfileSchema.parse(result),200)
    } catch (error) { return knownSocialError(c,error,{notFound:'PROFILE_NOT_FOUND'}) }
  })

  const relationship = (
    method: 'put' | 'delete',
    path: string,
    parameter: string,
    operation: (social: SocialPort, actor: Actor, id: string, context: MutationContext) => Promise<unknown>,
    responseSchema: typeof CreatedSchema | typeof DeletedSchema,
    missing: 'PROFILE_NOT_FOUND' | 'POST_NOT_FOUND',
  ) => {
    app[method](path, async (c) => {
      const unavailable = socialUnavailable(c, dependencies.social)
      if (unavailable) return unavailable
      const query = safeQuery(c)
      if (query === null || !EmptyQuerySchema.safeParse(query).success) return invalidRequest(c)
      const id = parseId(c.req.param(parameter))
      if (!id || !(await parseEmptyBody(c))) return invalidRequest(c)
      const actor = await resolveActor(c, dependencies, true)
      if (!actor.ok || actor.actor === null) return actor.ok ? apiError(c, 401, 'AUTH_REQUIRED', 'Authentication is required') : actor.response
      try {
        return c.json(responseSchema.parse(await operation(dependencies.social!, actor.actor, id, {requestId: c.get('requestId')})), 200)
      } catch (error) {
        return knownSocialError(c, error, {notFound: missing})
      }
    })
  }

  relationship('put', '/v1/profiles/:profileId/follow', 'profileId', (social, actor, id, context) => social.follow(actor, id, context), CreatedSchema, 'PROFILE_NOT_FOUND')
  relationship('delete', '/v1/profiles/:profileId/follow', 'profileId', (social, actor, id, context) => social.unfollow(actor, id, context), DeletedSchema, 'PROFILE_NOT_FOUND')
  relationship('put', '/v1/posts/:postId/like', 'postId', (social, actor, id, context) => social.likePost(actor, id, context), CreatedSchema, 'POST_NOT_FOUND')
  relationship('delete', '/v1/posts/:postId/like', 'postId', (social, actor, id, context) => social.unlikePost(actor, id, context), DeletedSchema, 'POST_NOT_FOUND')
  relationship('put', '/v1/posts/:postId/bookmark', 'postId', (social, actor, id, context) => social.bookmarkPost(actor, id, context), CreatedSchema, 'POST_NOT_FOUND')
  relationship('delete', '/v1/posts/:postId/bookmark', 'postId', (social, actor, id, context) => social.unbookmarkPost(actor, id, context), DeletedSchema, 'POST_NOT_FOUND')

  const actorPage = (
    path: '/v1/bookmarks' | '/v1/notifications',
    operation: (social: SocialPort, actor: Actor, query: z.infer<typeof PageQuerySchema>) => Promise<unknown>,
    responseSchema: typeof FeedPageSchema | typeof NotificationPageSchema,
  ) => {
    app.get(path, async (c) => {
      const unavailable = socialUnavailable(c, dependencies.social)
      if (unavailable) return unavailable
      const rawQuery = safeQuery(c)
      if (rawQuery === null) return invalidRequest(c)
      const query = PageQuerySchema.safeParse(rawQuery)
      if (!query.success) return invalidRequest(c)
      if (path === '/v1/notifications' && query.data.cursor) {
        try {
          decodeNotificationCursor(query.data.cursor)
        } catch {
          return invalidCursor(c)
        }
      }
      const actor = await resolveActor(c, dependencies, true)
      if (!actor.ok || actor.actor === null) return actor.ok ? apiError(c, 401, 'AUTH_REQUIRED', 'Authentication is required') : actor.response
      try {
        return c.json(responseSchema.parse(await operation(dependencies.social!, actor.actor, query.data)), 200)
      } catch (error) {
        return knownSocialError(c, error)
      }
    })
  }

  actorPage('/v1/bookmarks', (social, actor, query) => social.listBookmarks(actor, query), FeedPageSchema)
  actorPage('/v1/notifications', (social, actor, query) => social.listNotifications(actor, query), NotificationPageSchema)

  app.post('/v1/posts/:postId/comments', async (c) => {
    const unavailable = socialUnavailable(c, dependencies.social)
    if (unavailable) return unavailable
    const query = safeQuery(c)
    if (query === null || !EmptyQuerySchema.safeParse(query).success) return invalidRequest(c)
    const postId = parseId(c.req.param('postId'))
    if (!postId) return invalidRequest(c)
    const actor = await resolveActor(c, dependencies, true)
    if (!actor.ok || actor.actor === null) return actor.ok ? apiError(c, 401, 'AUTH_REQUIRED', 'Authentication is required') : actor.response
    if(declaredBodyTooLarge(c.req.raw,COMMENT_BODY_LIMIT)) return apiError(c,413,'PAYLOAD_TOO_LARGE','Request body is too large')
    let raw: unknown
    try {
      const text=await readBoundedBody(c.req.raw,COMMENT_BODY_LIMIT)
      if(hasDuplicateTopLevelJsonKey(text)) throw new Error('duplicate key')
      raw = JSON.parse(text)
    } catch (error) {
      if(error instanceof Error&&error.message==='BODY_TOO_LARGE') return apiError(c,413,'PAYLOAD_TOO_LARGE','Request body is too large')
      return apiError(c, 422, 'COMMENT_INVALID', 'Comment is invalid')
    }
    const input = CreateHumanCommentSchema.safeParse(raw)
    if (!input.success) return apiError(c, 422, 'COMMENT_INVALID', 'Comment is invalid')
    try {
      return c.json(PublicCommentSchema.parse(await dependencies.social!.createHumanComment(actor.actor, postId, input.data, {requestId: c.get('requestId')})), 201)
    } catch (error) {
      return knownSocialError(c, error, {notFound: 'POST_NOT_FOUND', comment: true})
    }
  })

  app.put('/v1/notifications/:notificationId/read', async (c) => {
    const unavailable = socialUnavailable(c, dependencies.social)
    if (unavailable) return unavailable
    const query = safeQuery(c)
    if (query === null || !EmptyQuerySchema.safeParse(query).success) return invalidRequest(c)
    const notificationId = parseId(c.req.param('notificationId'))
    if (!notificationId || !(await parseEmptyBody(c))) return invalidRequest(c)
    const actor = await resolveActor(c, dependencies, true)
    if (!actor.ok || actor.actor === null) return actor.ok ? apiError(c, 401, 'AUTH_REQUIRED', 'Authentication is required') : actor.response
    try {
      const result = await dependencies.social!.markNotificationRead(actor.actor, notificationId, {requestId: c.get('requestId')})
      if (result === null) return apiError(c, 404, 'NOTIFICATION_NOT_FOUND', 'Notification not found')
      return c.json(NotificationReadSchema.parse(result), 200)
    } catch (error) {
      return knownSocialError(c, error, {notFound: 'NOTIFICATION_NOT_FOUND'})
    }
  })
}
