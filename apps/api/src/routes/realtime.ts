import {createHash, timingSafeEqual} from 'node:crypto'
import type {Context, Hono} from 'hono'
import {z} from 'zod'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ProfilePort} from '../ports/profiles.js'
import type {RealtimePort} from '../ports/realtime.js'
import {strictJsonBody, strictQuery} from './strict-input.js'

type ApiContext = Context<{Variables: ApiVariables}>
type Dependencies = {auth?: AuthVerifier; profiles?: ProfilePort; realtime?: RealtimePort; realtimeAllowedOrigins?: string[]; realtimeInternalSecret?: string}
const empty = z.strictObject({})
const subject = z.string().min(1).max(512).refine(value => value.trim().length > 0)
const identity = z.strictObject({subject, profileId: z.uuid()})
const exactOrigin = z.string().max(256).refine(value => {
  try {const url = new URL(value); return url.protocol === 'https:' && url.origin === value} catch {return false}
})
const ticket = z.string().min(1).max(4096)
const redeemInput = z.strictObject({ticket, origin: exactOrigin})
const authorizeInput = identity.extend({sessionId: z.uuid(), conversationId: z.uuid(), eventType: z.enum(['message', 'read', 'typing', 'presence', 'access_revoked']).optional()})
const sessionOutput = identity.extend({sessionId: z.uuid(), sessionExpiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)})
const accessOutput = z.strictObject({allowed: z.boolean(), presenceAllowed: z.boolean()})
const ticketOutput = z.strictObject({ticket})
const unavailable = (c: ApiContext) => apiError(c, 503, 'REALTIME_NOT_CONFIGURED', 'Realtime is not configured')
const invalid = (c: ApiContext) => apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
const unauthorized = (c: ApiContext) => apiError(c, 401, 'UNAUTHORIZED', 'Unauthorized')
const failure = (c: ApiContext) => apiError(c, 500, 'INTERNAL_ERROR', 'Internal server error')

function internalAuth(c: ApiContext, dependencies: Dependencies): Response | null {
  const secret = dependencies.realtimeInternalSecret
  if (!dependencies.realtime || !secret || secret.trim() !== secret || Buffer.byteLength(secret) < 32) return unavailable(c)
  // Equal-sized digests ensure timingSafeEqual is used even when supplied credentials differ in length.
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest()
  const actual = createHash('sha256').update(c.req.header('authorization') ?? '').digest()
  return timingSafeEqual(expected, actual) ? null : unauthorized(c)
}

export function registerRealtimeRoutes(app: Hono<{Variables: ApiVariables}>, dependencies: Dependencies) {
  app.post('/v1/realtime/ticket', async c => {
    try {
      if (!dependencies.auth) return unavailable(c)
      const auth = await dependencies.auth.verify(c.req.raw)
      if (auth.status !== 'authenticated') return unauthorized(c)
      const origins = dependencies.realtimeAllowedOrigins
      if (!dependencies.realtime || !dependencies.profiles || !origins?.length || !origins.every(value => exactOrigin.safeParse(value).success)) return unavailable(c)
      const origin = c.req.header('origin')
      if (!origin || !origins.includes(origin)) return apiError(c, 403, 'REALTIME_ORIGIN_FORBIDDEN', 'Origin is not allowed')
      if (!strictQuery(c, empty) || !await strictJsonBody(c, empty)) return invalid(c)
      const account = await dependencies.profiles.getCurrentAccount({subject: auth.identity.subject})
      if (!account || account.kind !== 'human') return apiError(c, 403, 'HUMAN_ACCOUNT_REQUIRED', 'A human account is required')
      const current = identity.parse({subject: auth.identity.subject, profileId: account.id})
      return c.json(ticketOutput.parse({ticket: await dependencies.realtime.issue(current, origin)}))
    } catch {return failure(c)}
  })
  app.post('/v1/internal/realtime/redeem', async c => {
    try {
      const denied = internalAuth(c, dependencies)
      if (denied) return denied
      if (!strictQuery(c, empty)) return invalid(c)
      const input = await strictJsonBody(c, redeemInput)
      if (!input) return invalid(c)
      return c.json(sessionOutput.parse(await dependencies.realtime!.redeem(input)))
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_REALTIME_TICKET') return unauthorized(c)
      return failure(c)
    }
  })
  app.post('/v1/internal/realtime/authorize', async c => {
    try {
      const denied = internalAuth(c, dependencies)
      if (denied) return denied
      if (!strictQuery(c, empty)) return invalid(c)
      const input = await strictJsonBody(c, authorizeInput)
      if (!input) return invalid(c)
      const {eventType, ...identityAndConversation} = input
      return c.json(accessOutput.parse(await dependencies.realtime!.authorize({...identityAndConversation, ...(eventType ? {eventType} : {})})))
    } catch {return failure(c)}
  })
}
