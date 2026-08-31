import {
  CreatorDecisionInputSchema,
  CreatorRequestPageSchema,
  CreatorRequestSchema,
  CreatorSubmissionPageSchema,
  CreatorSubmissionRecordSchema,
} from '@aifans/contracts'
import type {Actor} from '@aifans/db'
import type {Context, Hono} from 'hono'
import {z} from 'zod'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {AuthorityPort} from '../ports/authority.js'
import type {PlatformCreatorPort} from '../ports/creator.js'
import type {ProfilePort} from '../ports/profiles.js'
import {strictJsonBody, strictQuery} from './strict-input.js'

export type AdminCreatorDependencies = {
  auth?: AuthVerifier
  profiles?: ProfilePort
  authority?: AuthorityPort
  platformCreator?: PlatformCreatorPort
}

type ApiContext = Context<{Variables: ApiVariables}>
type OperatorResolution = {ok: true; actor: Actor} | {ok: false; response: Response}

const idSchema = z.uuid()
const emptyQuerySchema = z.strictObject({})
const pageQuerySchema = z.strictObject({limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().min(1).optional()})
const quotaSchema = z.strictObject({quota: z.number().int().min(0).max(100)})

function pageInput(query: {limit: number; cursor?: string | undefined}) {
  return {limit: query.limit, ...(query.cursor === undefined ? {} : {cursor: query.cursor})}
}

function parsedId(c: ApiContext, name: string): string | null {
  const result = idSchema.safeParse(c.req.param(name))
  return result.success ? result.data : null
}

function errorValue(error: unknown, name: 'code' | 'message'): string | undefined {
  if (!error || typeof error !== 'object' || !(name in error)) return undefined
  const value = error[name as keyof typeof error]
  return typeof value === 'string' ? value : undefined
}

function reviewError(c: ApiContext, error: unknown): Response {
  const code = errorValue(error, 'code')
  const message = errorValue(error, 'message') ?? ''
  if (/^DATABASE_PLATFORM_URL must be a valid postgres URL$/.test(message)) return apiError(c, 503, 'DATABASE_NOT_CONFIGURED', 'Database is not configured')
  if (code === '42501' || message === 'FORBIDDEN') return apiError(c, 403, 'OPERATOR_REQUIRED', 'An active operator is required')
  if (code === 'P0002' || /not found/i.test(message)) return apiError(c, 404, 'CREATOR_REVIEW_NOT_FOUND', 'Creator review was not found')
  if (code === 'P0001' || code === '23505' || /conflict|terminal state|changed concurrently/i.test(message)) return apiError(c, 409, 'CREATOR_CONFLICT', 'Creator review conflicts with its current state')
  if (code === '23514') return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
  throw error
}

async function requireOperator(c: ApiContext, dependencies: AdminCreatorDependencies): Promise<OperatorResolution> {
  if (!dependencies.auth) return {ok: false, response: apiError(c, 503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured')}
  const result = await dependencies.auth.verify(c.req.raw)
  if (result.status === 'missing') return {ok: false, response: apiError(c, 401, 'AUTH_REQUIRED', 'Authentication is required')}
  if (result.status === 'invalid' || !result.identity.subject.trim()) return {ok: false, response: apiError(c, 401, 'AUTH_INVALID', 'Authentication is invalid')}
  if (!dependencies.profiles) return {ok: false, response: apiError(c, 503, 'PROFILE_NOT_CONFIGURED', 'Profiles are not configured')}
  const actor = {subject: result.identity.subject}
  await dependencies.profiles.ensureHumanProfile({authSubject: result.identity.subject, ...(result.identity.email === undefined ? {} : {email: result.identity.email}), ...(result.identity.displayName === undefined ? {} : {displayName: result.identity.displayName})})
  const account = await dependencies.profiles.getCurrentAccount(actor)
  if (!account) return {ok: false, response: apiError(c, 500, 'PROFILE_NOT_AVAILABLE', 'Profile is not available')}
  if (account.kind !== 'human') return {ok: false, response: apiError(c, 403, 'HUMAN_REQUIRED', 'A human account is required')}
  if (!dependencies.authority) return {ok: false, response: apiError(c, 503, 'AUTHORITY_NOT_CONFIGURED', 'Authority is not configured')}
  if (!await dependencies.authority.isCurrentActorOperator(actor)) return {ok: false, response: apiError(c, 403, 'OPERATOR_REQUIRED', 'An active operator is required')}
  return {ok: true, actor}
}

function platformPort(c: ApiContext, dependencies: AdminCreatorDependencies): PlatformCreatorPort | Response {
  return dependencies.platformCreator ?? apiError(c, 503, 'CREATOR_REVIEW_NOT_CONFIGURED', 'Creator review is not configured')
}

function noQuery(c: ApiContext): Response | null {
  return strictQuery(c, emptyQuerySchema) === null ? apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid') : null
}

export function registerAdminCreatorRoutes(app: Hono<{Variables: ApiVariables}>, dependencies: AdminCreatorDependencies) {
  app.get('/v1/admin/creator/submissions', async (c) => {
    const query = strictQuery(c, pageQuerySchema); if (!query) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try { const operator = await requireOperator(c, dependencies); if (!operator.ok) return operator.response; const port = platformPort(c, dependencies); if (port instanceof Response) return port; return c.json(CreatorSubmissionPageSchema.parse(await port.listSubmissions(operator.actor, pageInput(query)))) } catch (error) { return reviewError(c, error) }
  })
  app.get('/v1/admin/creator/submissions/:submissionId', async (c) => {
    if (noQuery(c)) return noQuery(c)!; const id = parsedId(c, 'submissionId'); if (!id) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try { const operator = await requireOperator(c, dependencies); if (!operator.ok) return operator.response; const port = platformPort(c, dependencies); if (port instanceof Response) return port; const value = await port.getSubmission(operator.actor, id); return value ? c.json(CreatorSubmissionRecordSchema.parse(value)) : apiError(c, 404, 'CREATOR_SUBMISSION_NOT_FOUND', 'Creator submission was not found') } catch (error) { return reviewError(c, error) }
  })
  app.post('/v1/admin/creator/submissions/:submissionId/decision', async (c) => {
    if (noQuery(c)) return noQuery(c)!; const submissionId = parsedId(c, 'submissionId'); if (!submissionId) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const body = await strictJsonBody(c, CreatorDecisionInputSchema); if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    try { const operator = await requireOperator(c, dependencies); if (!operator.ok) return operator.response; const port = platformPort(c, dependencies); if (port instanceof Response) return port; return c.json(CreatorSubmissionRecordSchema.parse(await port.decideSubmission({actor: operator.actor, submissionId, ...body, requestId: c.get('requestId')}))) } catch (error) { return reviewError(c, error) }
  })
  app.get('/v1/admin/creator/requests', async (c) => {
    const query = strictQuery(c, pageQuerySchema); if (!query) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try { const operator = await requireOperator(c, dependencies); if (!operator.ok) return operator.response; const port = platformPort(c, dependencies); if (port instanceof Response) return port; return c.json(CreatorRequestPageSchema.parse(await port.listRequests(operator.actor, pageInput(query)))) } catch (error) { return reviewError(c, error) }
  })
  app.get('/v1/admin/creator/requests/:requestId', async (c) => {
    if (noQuery(c)) return noQuery(c)!; const id = parsedId(c, 'requestId'); if (!id) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try { const operator = await requireOperator(c, dependencies); if (!operator.ok) return operator.response; const port = platformPort(c, dependencies); if (port instanceof Response) return port; const value = await port.getRequest(operator.actor, id); return value ? c.json(CreatorRequestSchema.parse(value)) : apiError(c, 404, 'CREATOR_REQUEST_NOT_FOUND', 'Creator request was not found') } catch (error) { return reviewError(c, error) }
  })
  app.post('/v1/admin/creator/requests/:requestId/decision', async (c) => {
    if (noQuery(c)) return noQuery(c)!; const requestId = parsedId(c, 'requestId'); if (!requestId) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const body = await strictJsonBody(c, CreatorDecisionInputSchema); if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    try { const operator = await requireOperator(c, dependencies); if (!operator.ok) return operator.response; const port = platformPort(c, dependencies); if (port instanceof Response) return port; return c.json(CreatorRequestSchema.parse(await port.decideRequest({actor: operator.actor, requestId, ...body, correlationId: c.get('requestId')}))) } catch (error) { return reviewError(c, error) }
  })
  app.put('/v1/admin/creator/quotas/:profileId', async (c) => {
    if (noQuery(c)) return noQuery(c)!; const profileId = parsedId(c, 'profileId'); if (!profileId) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const body = await strictJsonBody(c, quotaSchema); if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    try { const operator = await requireOperator(c, dependencies); if (!operator.ok) return operator.response; const port = platformPort(c, dependencies); if (port instanceof Response) return port; return c.json(await port.setQuota(operator.actor, profileId, body.quota)) } catch (error) { return reviewError(c, error) }
  })
}
