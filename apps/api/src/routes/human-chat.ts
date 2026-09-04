import {HumanMessageSchema, HumanReadCursorSchema, HumanReadInputSchema, HumanSendInputSchema, HumanConversationCreateInputSchema, HumanConversationSchema, HumanInboxCursorSchema, HumanInboxPageSchema} from '@aifans/contracts'
import type {Actor} from '@aifans/db'
import type {Context, Hono} from 'hono'
import {z} from 'zod'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {HumanChatPort} from '../ports/human-chat.js'
import type {HumanChatMediaPort} from '../ports/human-chat-media.js'
import type {HumanChatRichContentPort} from '../ports/human-chat-rich-content.js'
import {HumanStickerIdSchema} from '@aifans/contracts'
import type {ProfilePort} from '../ports/profiles.js'
import {strictJsonBody, strictQuery} from './strict-input.js'

type ApiContext = Context<{Variables: ApiVariables}>
type Dependencies = {auth?: AuthVerifier; profiles?: ProfilePort; humanChat?: HumanChatPort;humanChatMedia?:HumanChatMediaPort;humanChatRichContent?:HumanChatRichContentPort}
const uuid = z.uuid()
const emptyQuery = z.strictObject({})
const integerQuery = z.string().regex(/^(0|[1-9]\d*)$/).transform(Number).pipe(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER))
const historyQuery = z.strictObject({afterSequence: integerQuery.default(0), limit: integerQuery.pipe(z.number().min(1).max(100)).default(50)})
const inboxQuery = z.strictObject({limit: integerQuery.pipe(z.number().min(1).max(100)).default(50), cursor: HumanInboxCursorSchema.optional()})
const openedSchema = z.strictObject({conversation: HumanConversationSchema})
const sentSchema = z.strictObject({message: HumanMessageSchema})
const historySchema = z.strictObject({items: z.array(HumanMessageSchema).max(100)})
const invalid = (c: ApiContext) => apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')

function failure(c: ApiContext, error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  switch (code) {
    case 'PDM01': return apiError(c, 403, 'HUMAN_CHAT_BLOCKED', 'Messaging is unavailable because of a block')
    case 'PDM02': return apiError(c, 403, 'HUMAN_CHAT_MUTUAL_FOLLOW_REQUIRED', 'Mutual following is required to start messaging')
    case '42501': case 'P0002': return apiError(c, 404, 'HUMAN_CHAT_NOT_FOUND', 'Human chat resource was not found')
    case '23505': return apiError(c, 409, 'HUMAN_CHAT_CONFLICT', 'Human chat request conflicts with existing data')
    case '22023': return apiError(c, 422, 'HUMAN_CHAT_INVALID_OPERATION', 'Human chat operation is invalid')
    default: return apiError(c, 500, 'INTERNAL_ERROR', 'Internal server error')
  }
}

async function resolveHuman(c: ApiContext, dependencies: Dependencies): Promise<{actor: Actor; profileId: string} | Response> {
  if (!dependencies.auth) return apiError(c, 503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured')
  const result = await dependencies.auth.verify(c.req.raw)
  if (result.status !== 'authenticated') return apiError(c, 401, 'UNAUTHORIZED', 'Authentication is required')
  if (!dependencies.profiles || !dependencies.humanChat) return apiError(c, 503, 'HUMAN_CHAT_NOT_CONFIGURED', 'Human chat is not configured')
  const actor = {subject: result.identity.subject}
  const account = await dependencies.profiles.getCurrentAccount(actor)
  if (!account || account.kind !== 'human') return apiError(c, 403, 'HUMAN_ACCOUNT_REQUIRED', 'A human account is required')
  return {actor, profileId: uuid.parse(account.id)}
}

export function registerHumanChatRoutes(app: Hono<{Variables: ApiVariables}>, dependencies: Dependencies) {
  app.use('/v1/human-chat/*', async (c, next) => {c.header('Cache-Control', 'private, no-store'); await next()})
  app.post('/v1/human-chat/conversations', async c => {
    try {
      const current = await resolveHuman(c, dependencies)
      if (current instanceof Response) return current
      if (!strictQuery(c, emptyQuery)) return invalid(c)
      const input = await strictJsonBody(c, HumanConversationCreateInputSchema)
      if (!input) return invalid(c)
      if (!dependencies.humanChat?.open) return apiError(c, 503, 'HUMAN_CHAT_NOT_CONFIGURED', 'Human chat is not configured')
      return c.json(openedSchema.parse({conversation: await dependencies.humanChat.open(current.actor, input)}))
    } catch (error) {return failure(c, error)}
  })
  app.get('/v1/human-chat/conversations', async c => {
    try {
      const current = await resolveHuman(c, dependencies)
      if (current instanceof Response) return current
      const query = strictQuery(c, inboxQuery)
      if (!query) return invalid(c)
      if (!dependencies.humanChat?.list) return apiError(c, 503, 'HUMAN_CHAT_NOT_CONFIGURED', 'Human chat is not configured')
      return c.json(HumanInboxPageSchema.parse(await dependencies.humanChat.list(current.actor, query)))
    } catch (error) {return failure(c, error)}
  })
  app.post('/v1/human-chat/peers/:peerProfileId/messages', async c => {
    try {
      const current = await resolveHuman(c, dependencies)
      if (current instanceof Response) return current
      const peer = uuid.safeParse(c.req.param('peerProfileId'))
      if (!peer.success || !strictQuery(c, emptyQuery)) return invalid(c)
      const input = await strictJsonBody(c, HumanSendInputSchema)
      if (!input) return invalid(c)
      if (input.content.kind !== 'text' && !(dependencies.humanChatMedia && ['image','voice'].includes(input.content.kind)) && !(dependencies.humanChatRichContent && ['sticker','share'].includes(input.content.kind))) return apiError(c, 422, 'HUMAN_MESSAGE_KIND_UNSUPPORTED', 'This message format is not available')
      if(input.content.kind==='sticker'&&!HumanStickerIdSchema.safeParse(input.content.stickerId).success)return invalid(c)
      return c.json(sentSchema.parse({message: await dependencies.humanChat!.send(current.actor, {...input, peerProfileId: peer.data})}))
    } catch (error) {return failure(c, error)}
  })
  app.get('/v1/human-chat/conversations/:conversationId/messages', async c => {
    try {
      const current = await resolveHuman(c, dependencies)
      if (current instanceof Response) return current
      const conversation = uuid.safeParse(c.req.param('conversationId'))
      const query = strictQuery(c, historyQuery)
      if (!conversation.success || !query) return invalid(c)
      return c.json(historySchema.parse({items: await dependencies.humanChat!.history(current.actor, {...query, conversationId: conversation.data})}))
    } catch (error) {return failure(c, error)}
  })
  app.post('/v1/human-chat/conversations/:conversationId/read', async c => {
    try {
      const current = await resolveHuman(c, dependencies)
      if (current instanceof Response) return current
      const conversation = uuid.safeParse(c.req.param('conversationId'))
      if (!conversation.success || !strictQuery(c, emptyQuery)) return invalid(c)
      const input = await strictJsonBody(c, HumanReadInputSchema)
      if (!input) return invalid(c)
      const lastReadSequence = await dependencies.humanChat!.markRead(current.actor, {...input, conversationId: conversation.data})
      return c.json(HumanReadCursorSchema.parse({conversationId: conversation.data, profileId: current.profileId, lastReadSequence}))
    } catch (error) {return failure(c, error)}
  })
}
