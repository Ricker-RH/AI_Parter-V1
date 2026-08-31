import {
  CommentCursorSchema,
  CreateHumanCommentSchema,
  FeedPageSchema,
  FeedQuerySchema,
  NotificationPageSchema,
  PageQuerySchema,
  PostDetailSchema,
  PublicCommentSchema,
  decodeCursor,
} from '@aifans/contracts'
import type {Actor} from '@aifans/db'
import type {Context, Hono} from 'hono'
import {z} from 'zod'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ProfilePort} from '../ports/profiles.js'
import type {SocialPort} from '../ports/social.js'

type SocialDependencies = {
  auth?: AuthVerifier
  profiles?: ProfilePort
  social?: SocialPort
}

type ApiContext = Context<{Variables: ApiVariables}>
type ActorResolution = {ok: true; actor: Actor | null} | {ok: false; response: Response}

const IdParameterSchema = z.uuid()
const EmptyBodySchema = z.strictObject({})
const PostQuerySchema = z.strictObject({
  commentLimit: z.coerce.number().int().min(1).max(50).default(25),
  commentCursor: z.string().min(1).optional(),
})
const CreatedSchema = z.strictObject({created: z.boolean()})
const DeletedSchema = z.strictObject({deleted: z.boolean()})
const NotificationReadSchema = z.strictObject({readAt: z.iso.datetime()})

const invalidRequest = (c: ApiContext) => apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
const invalidCursor = (c: ApiContext) => apiError(c, 400, 'INVALID_CURSOR', 'Cursor is invalid')

function safeQuery(c: ApiContext): Record<string, string> {
  return c.req.query()
}

function parseId(value: string | undefined): string | null {
  const parsed = IdParameterSchema.safeParse(value)
  if (!parsed.success) return null
  return parsed.data
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

function knownSocialError(c: ApiContext, error: unknown): Response {
  if (!(error instanceof Error)) throw error
  switch (error.message) {
    case 'INVALID_CURSOR':
      return invalidCursor(c)
    case 'POST_NOT_FOUND':
      return apiError(c, 404, 'POST_NOT_FOUND', 'Post not found')
    case 'PROFILE_NOT_FOUND':
      return apiError(c, 404, 'PROFILE_NOT_FOUND', 'Profile not found')
    case 'NOTIFICATION_NOT_FOUND':
      return apiError(c, 404, 'NOTIFICATION_NOT_FOUND', 'Notification not found')
    case 'COMMENT_INVALID':
      return apiError(c, 422, 'COMMENT_INVALID', 'Comment is invalid')
    case 'FORBIDDEN':
      return apiError(c, 403, 'FORBIDDEN', 'Action is not allowed')
    default:
      throw error
  }
}

function socialUnavailable(c: ApiContext, social?: SocialPort): Response | null {
  return social ? null : apiError(c, 503, 'SOCIAL_NOT_CONFIGURED', 'Social features are not configured')
}

export function registerSocialRoutes(app: Hono<{Variables: ApiVariables}>, dependencies: SocialDependencies) {
  app.get('/v1/feed', async (c) => {
    const unavailable = socialUnavailable(c, dependencies.social)
    if (unavailable) return unavailable
    const query = FeedQuerySchema.safeParse(safeQuery(c))
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
    const query = PostQuerySchema.safeParse(safeQuery(c))
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

  const relationship = (
    method: 'put' | 'delete',
    path: string,
    parameter: string,
    operation: (social: SocialPort, actor: Actor, id: string) => Promise<unknown>,
    responseSchema: typeof CreatedSchema | typeof DeletedSchema,
  ) => {
    app[method](path, async (c) => {
      const unavailable = socialUnavailable(c, dependencies.social)
      if (unavailable) return unavailable
      const id = parseId(c.req.param(parameter))
      if (!id || !(await parseEmptyBody(c))) return invalidRequest(c)
      const actor = await resolveActor(c, dependencies, true)
      if (!actor.ok || actor.actor === null) return actor.ok ? apiError(c, 401, 'AUTH_REQUIRED', 'Authentication is required') : actor.response
      try {
        return c.json(responseSchema.parse(await operation(dependencies.social!, actor.actor, id)), 200)
      } catch (error) {
        return knownSocialError(c, error)
      }
    })
  }

  relationship('put', '/v1/profiles/:profileId/follow', 'profileId', (social, actor, id) => social.follow(actor, id), CreatedSchema)
  relationship('delete', '/v1/profiles/:profileId/follow', 'profileId', (social, actor, id) => social.unfollow(actor, id), DeletedSchema)
  relationship('put', '/v1/posts/:postId/like', 'postId', (social, actor, id) => social.likePost(actor, id), CreatedSchema)
  relationship('delete', '/v1/posts/:postId/like', 'postId', (social, actor, id) => social.unlikePost(actor, id), DeletedSchema)
  relationship('put', '/v1/posts/:postId/bookmark', 'postId', (social, actor, id) => social.bookmarkPost(actor, id), CreatedSchema)
  relationship('delete', '/v1/posts/:postId/bookmark', 'postId', (social, actor, id) => social.unbookmarkPost(actor, id), DeletedSchema)

  const actorPage = (
    path: '/v1/bookmarks' | '/v1/notifications',
    operation: (social: SocialPort, actor: Actor, query: z.infer<typeof PageQuerySchema>) => Promise<unknown>,
    responseSchema: typeof FeedPageSchema | typeof NotificationPageSchema,
  ) => {
    app.get(path, async (c) => {
      const unavailable = socialUnavailable(c, dependencies.social)
      if (unavailable) return unavailable
      const query = PageQuerySchema.safeParse(safeQuery(c))
      if (!query.success) return invalidRequest(c)
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
    const postId = parseId(c.req.param('postId'))
    if (!postId) return invalidRequest(c)
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return apiError(c, 422, 'COMMENT_INVALID', 'Comment is invalid')
    }
    const input = CreateHumanCommentSchema.safeParse(raw)
    if (!input.success) return apiError(c, 422, 'COMMENT_INVALID', 'Comment is invalid')
    const actor = await resolveActor(c, dependencies, true)
    if (!actor.ok || actor.actor === null) return actor.ok ? apiError(c, 401, 'AUTH_REQUIRED', 'Authentication is required') : actor.response
    try {
      return c.json(PublicCommentSchema.parse(await dependencies.social!.createHumanComment(actor.actor, postId, input.data)), 201)
    } catch (error) {
      return knownSocialError(c, error)
    }
  })

  app.post('/v1/notifications/:notificationId/read', async (c) => {
    const unavailable = socialUnavailable(c, dependencies.social)
    if (unavailable) return unavailable
    const notificationId = parseId(c.req.param('notificationId'))
    if (!notificationId || !(await parseEmptyBody(c))) return invalidRequest(c)
    const actor = await resolveActor(c, dependencies, true)
    if (!actor.ok || actor.actor === null) return actor.ok ? apiError(c, 401, 'AUTH_REQUIRED', 'Authentication is required') : actor.response
    try {
      const result = await dependencies.social!.markNotificationRead(actor.actor, notificationId)
      if (result === null) return apiError(c, 404, 'NOTIFICATION_NOT_FOUND', 'Notification not found')
      return c.json(NotificationReadSchema.parse(result), 200)
    } catch (error) {
      return knownSocialError(c, error)
    }
  })
}
