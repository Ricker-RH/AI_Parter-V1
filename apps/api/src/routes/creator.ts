import {
  CreatorAnalyticsSchema,
  CreatorDraftInputSchema,
  CreatorDraftPageSchema,
  CreatorDraftSchema,
  CreatorIpPageSchema,
  CreatorIpSchema,
  CreatorReferenceSelectionSchema,
  CreatorRequestInputSchema,
  CreatorRequestPageSchema,
  CreatorRequestSchema,
  CreatorSubmissionPageSchema,
  CreatorSubmissionRecordSchema,
  CreatorSubmissionSchema,
} from '@aifans/contracts'
import {randomUUID} from 'node:crypto'
import type {Actor} from '@aifans/db'
import type {Context, Hono} from 'hono'
import {z} from 'zod'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import {CREATOR_ASSET_INTENT_TTL_SECONDS, type AssetPort, type ImageGenerationPort} from '../ports/assets.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {CreatorPort} from '../ports/creator.js'
import type {ProfilePort} from '../ports/profiles.js'
import {strictJsonBody, strictQuery} from './strict-input.js'

export type CreatorDependencies = {
  auth?: AuthVerifier
  profiles?: ProfilePort
  creator?: CreatorPort
  assets?: AssetPort
  imageGeneration?: ImageGenerationPort
}

type ApiContext = Context<{Variables: ApiVariables}>
type Human = {actor: Actor; profileId: string}
type HumanResolution = {ok: true; human: Human} | {ok: false; response: Response}

const idSchema = z.uuid()
const emptyQuerySchema = z.strictObject({})
const pageQuerySchema = z.strictObject({limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().min(1).optional()})
const contentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp'])
const uploadIntentSchema = z.strictObject({contentType: contentTypeSchema, sizeBytes: z.number().int().min(1).max(10_485_760)})
const registerReferenceSchema = z.strictObject({assetId: idSchema, width: z.number().int().min(1).max(16384), height: z.number().int().min(1).max(16384)})
const submitBodySchema = z.strictObject({authorizationVersion: z.string().trim().min(1).max(100), references: z.array(CreatorReferenceSelectionSchema).min(5).max(8)})
const requestBodySchema = z.strictObject({kind: z.enum(['change', 'unpublish', 'deletion']), reason: z.string().trim().min(10).max(2000), proposedDraftId: idSchema.optional()})
const emptyBodySchema = z.strictObject({})
const readIntentSchema = z.strictObject({method: z.literal('GET'), url: z.url(), expiresAt: z.iso.datetime()})
const generationIntentSchema = z.strictObject({
  jobId: idSchema,
  status: z.enum(['queued', 'ready']),
  candidates: z.array(z.strictObject({id: idSchema, readIntent: readIntentSchema})).max(8),
})

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

function creatorError(c: ApiContext, error: unknown): Response {
  const code = errorValue(error, 'code')
  const message = errorValue(error, 'message') ?? ''
  if (/^DATABASE_(?:USER|PROVISIONING)_URL must be a valid postgres URL$/.test(message)) return apiError(c, 503, 'DATABASE_NOT_CONFIGURED', 'Database is not configured')
  if (code === '42501' || message === 'FORBIDDEN') return apiError(c, 403, 'CREATOR_FORBIDDEN', 'Creator access is forbidden')
  if (code === 'P0002' || /not found/i.test(message)) return apiError(c, 404, 'CREATOR_NOT_FOUND', 'Creator resource was not found')
  if (message === 'ASSET_NOT_FOUND') return apiError(c, 409, 'ASSET_NOT_READY', 'Private asset is not available')
  if (code === 'P0001' || code === '23505' || /quota|conflict|immutable|submitted|limit exceeded|pending request/i.test(message)) return apiError(c, 409, 'CREATOR_CONFLICT', 'Creator resource conflicts with its current state')
  if (code === '23514' || message === 'ASSET_INVALID') return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
  throw error
}

async function requireHuman(c: ApiContext, dependencies: CreatorDependencies): Promise<HumanResolution> {
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
  return {ok: true, human: {actor, profileId: account.id}}
}

function requireCreator(c: ApiContext, dependencies: CreatorDependencies): CreatorPort | Response {
  return dependencies.creator ?? apiError(c, 503, 'CREATOR_NOT_CONFIGURED', 'Creator features are not configured')
}

async function ownedDraft(c: ApiContext, creator: CreatorPort, human: Human, draftId: string) {
  const draft = await creator.getDraft(human.actor, draftId)
  if (!draft) return {ok: false as const, response: apiError(c, 404, 'CREATOR_DRAFT_NOT_FOUND', 'Creator draft was not found')}
  return {ok: true as const, draft}
}

function noQuery(c: ApiContext): Response | null {
  return strictQuery(c, emptyQuerySchema) === null ? apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid') : null
}

export function registerCreatorRoutes(app: Hono<{Variables: ApiVariables}>, dependencies: CreatorDependencies) {
  app.post('/v1/creator/drafts', async (c) => {
    if (noQuery(c)) return noQuery(c)!
    const body = await strictJsonBody(c, CreatorDraftInputSchema)
    if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    try {
      const human = await requireHuman(c, dependencies); if (!human.ok) return human.response
      const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator
      return c.json(CreatorDraftSchema.parse(await creator.createDraft(human.human.actor, body)), 201)
    } catch (error) { return creatorError(c, error) }
  })

  app.get('/v1/creator/drafts', async (c) => {
    const query = strictQuery(c, pageQuerySchema); if (!query) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try {
      const human = await requireHuman(c, dependencies); if (!human.ok) return human.response
      const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator
      return c.json(CreatorDraftPageSchema.parse(await creator.listDrafts(human.human.actor, pageInput(query))))
    } catch (error) { return creatorError(c, error) }
  })

  app.get('/v1/creator/drafts/:draftId', async (c) => {
    if (noQuery(c)) return noQuery(c)!
    const draftId = parsedId(c, 'draftId'); if (!draftId) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try {
      const human = await requireHuman(c, dependencies); if (!human.ok) return human.response
      const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator
      const result = await ownedDraft(c, creator, human.human, draftId)
      return result.ok ? c.json(CreatorDraftSchema.parse(result.draft)) : result.response
    } catch (error) { return creatorError(c, error) }
  })

  app.patch('/v1/creator/drafts/:draftId', async (c) => {
    if (noQuery(c)) return noQuery(c)!
    const draftId = parsedId(c, 'draftId'); if (!draftId) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const body = await strictJsonBody(c, CreatorDraftInputSchema); if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    try {
      const human = await requireHuman(c, dependencies); if (!human.ok) return human.response
      const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator
      return c.json(CreatorDraftSchema.parse(await creator.updateDraft(human.human.actor, draftId, body)))
    } catch (error) { return creatorError(c, error) }
  })

  app.delete('/v1/creator/drafts/:draftId', async (c) => {
    if (noQuery(c)) return noQuery(c)!
    const draftId = parsedId(c, 'draftId'); if (!draftId) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try {
      const human = await requireHuman(c, dependencies); if (!human.ok) return human.response
      const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator
      const result = await creator.deleteDraft(human.human.actor, draftId)
      return result.deleted ? c.body(null, 204) : apiError(c, 404, 'CREATOR_DRAFT_NOT_FOUND', 'Creator draft was not found')
    } catch (error) { return creatorError(c, error) }
  })

  app.post('/v1/creator/drafts/:draftId/references/upload-intent', async (c) => {
    if (noQuery(c)) return noQuery(c)!
    const draftId = parsedId(c, 'draftId'); if (!draftId) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const body = await strictJsonBody(c, uploadIntentSchema); if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    try {
      const human = await requireHuman(c, dependencies); if (!human.ok) return human.response
      const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator
      const owned = await ownedDraft(c, creator, human.human, draftId); if (!owned.ok) return owned.response
      if (owned.draft.status !== 'draft') return apiError(c, 409, 'CREATOR_CONFLICT', 'Creator draft is immutable')
      if (owned.draft.references.length >= 8) return apiError(c, 409, 'REFERENCE_LIMIT_REACHED', 'Reference limit was reached')
      if (!dependencies.assets) return apiError(c, 503, 'ASSETS_NOT_CONFIGURED', 'Private assets are not configured')
      const reservation = await creator.reserveReferenceUpload(human.human.actor, draftId, {
        id: randomUUID(),
        ...body,
        expiresAt: new Date(Date.now() + CREATOR_ASSET_INTENT_TTL_SECONDS * 1000).toISOString(),
      })
      return c.json(await dependencies.assets.createUploadIntent({creatorProfileId: human.human.profileId, draftId, assetId: reservation.id, contentType: reservation.contentType, sizeBytes: reservation.sizeBytes, expiresAt: reservation.expiresAt}), 201)
    } catch (error) { return creatorError(c, error) }
  })

  app.post('/v1/creator/drafts/:draftId/references', async (c) => {
    if (noQuery(c)) return noQuery(c)!
    const draftId = parsedId(c, 'draftId'); if (!draftId) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const body = await strictJsonBody(c, registerReferenceSchema); if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    try {
      const human = await requireHuman(c, dependencies); if (!human.ok) return human.response
      const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator
      const owned = await ownedDraft(c, creator, human.human, draftId); if (!owned.ok) return owned.response
      if (owned.draft.status !== 'draft' || owned.draft.references.length >= 8) return apiError(c, 409, 'CREATOR_CONFLICT', 'Creator reference conflicts with its current state')
      if (!dependencies.assets) return apiError(c, 503, 'ASSETS_NOT_CONFIGURED', 'Private assets are not configured')
      const reservation = await creator.getReferenceUploadReservation(human.human.actor, draftId, body.assetId)
      if (!reservation) return apiError(c, 404, 'CREATOR_REFERENCE_UPLOAD_NOT_FOUND', 'Creator reference upload was not found')
      const inspected = await dependencies.assets.inspectUpload({creatorProfileId: human.human.profileId, draftId, assetId: body.assetId, contentType: reservation.contentType, expectedSizeBytes: reservation.sizeBytes})
      const result = await creator.registerReference(human.human.actor, draftId, {id: inspected.assetId, contentType: inspected.contentType, sizeBytes: reservation.sizeBytes, width: body.width, height: body.height})
      return c.json({assetId: inspected.assetId, created: result.created}, result.created ? 201 : 200)
    } catch (error) { return creatorError(c, error) }
  })

  app.get('/v1/creator/drafts/:draftId/references/:assetId/read-intent', async (c) => {
    const draftId = parsedId(c, 'draftId'); const assetId = parsedId(c, 'assetId')
    const query = strictQuery(c, emptyQuerySchema)
    if (!draftId || !assetId || !query) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try {
      const human = await requireHuman(c, dependencies); if (!human.ok) return human.response
      const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator
      const owned = await ownedDraft(c, creator, human.human, draftId); if (!owned.ok) return owned.response
      if (!owned.draft.references.some((reference) => reference.id === assetId)) return apiError(c, 404, 'CREATOR_REFERENCE_NOT_FOUND', 'Creator reference was not found')
      if (!dependencies.assets) return apiError(c, 503, 'ASSETS_NOT_CONFIGURED', 'Private assets are not configured')
      return c.json(await dependencies.assets.createReadIntent({creatorProfileId: human.human.profileId, draftId, assetId}))
    } catch (error) { return creatorError(c, error) }
  })

  app.post('/v1/creator/drafts/:draftId/generation-intent', async (c) => {
    if (noQuery(c)) return noQuery(c)!
    const draftId = parsedId(c, 'draftId'); if (!draftId) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const body = await strictJsonBody(c, emptyBodySchema); if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    try {
      const human = await requireHuman(c, dependencies); if (!human.ok) return human.response
      const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator
      const owned = await ownedDraft(c, creator, human.human, draftId); if (!owned.ok) return owned.response
      if (!dependencies.imageGeneration) return apiError(c, 503, 'IMAGE_GENERATION_NOT_CONFIGURED', 'Image generation is not configured')
      return c.json(generationIntentSchema.parse(await dependencies.imageGeneration.createGenerationIntent({actorSubject: human.human.actor.subject, creatorProfileId: human.human.profileId, draftId, requestId: c.get('requestId')})), 201)
    } catch (error) { return creatorError(c, error) }
  })

  app.post('/v1/creator/drafts/:draftId/submit', async (c) => {
    if (noQuery(c)) return noQuery(c)!
    const draftId = parsedId(c, 'draftId'); if (!draftId) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const body = await strictJsonBody(c, submitBodySchema); if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    const submission = CreatorSubmissionSchema.safeParse({draftId, ...body}); if (!submission.success) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    try {
      const human = await requireHuman(c, dependencies); if (!human.ok) return human.response
      const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator
      return c.json(CreatorSubmissionRecordSchema.parse(await creator.submitDraft(human.human.actor, submission.data, {requestId: c.get('requestId')})), 201)
    } catch (error) { return creatorError(c, error) }
  })

  app.get('/v1/creator/submissions', async (c) => {
    const query = strictQuery(c, pageQuerySchema); if (!query) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try { const human = await requireHuman(c, dependencies); if (!human.ok) return human.response; const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator; return c.json(CreatorSubmissionPageSchema.parse(await creator.listSubmissions(human.human.actor, pageInput(query)))) } catch (error) { return creatorError(c, error) }
  })
  app.get('/v1/creator/submissions/:submissionId', async (c) => {
    if (noQuery(c)) return noQuery(c)!; const id = parsedId(c, 'submissionId'); if (!id) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try { const human = await requireHuman(c, dependencies); if (!human.ok) return human.response; const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator; const value = await creator.getSubmission(human.human.actor, id); return value ? c.json(CreatorSubmissionRecordSchema.parse(value)) : apiError(c, 404, 'CREATOR_SUBMISSION_NOT_FOUND', 'Creator submission was not found') } catch (error) { return creatorError(c, error) }
  })
  app.get('/v1/creator/ips', async (c) => {
    const query = strictQuery(c, pageQuerySchema); if (!query) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try { const human = await requireHuman(c, dependencies); if (!human.ok) return human.response; const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator; return c.json(CreatorIpPageSchema.parse(await creator.listIps(human.human.actor, pageInput(query)))) } catch (error) { return creatorError(c, error) }
  })
  app.get('/v1/creator/ips/:ipProfileId', async (c) => {
    if (noQuery(c)) return noQuery(c)!; const id = parsedId(c, 'ipProfileId'); if (!id) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try { const human = await requireHuman(c, dependencies); if (!human.ok) return human.response; const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator; const value = await creator.getIp(human.human.actor, id); return value ? c.json(CreatorIpSchema.parse(value)) : apiError(c, 404, 'CREATOR_IP_NOT_FOUND', 'Creator IP was not found') } catch (error) { return creatorError(c, error) }
  })
  app.get('/v1/creator/ips/:ipProfileId/analytics', async (c) => {
    if (noQuery(c)) return noQuery(c)!; const id = parsedId(c, 'ipProfileId'); if (!id) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try { const human = await requireHuman(c, dependencies); if (!human.ok) return human.response; const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator; const value = await creator.getAnalytics(human.human.actor, id); return value ? c.json(CreatorAnalyticsSchema.parse(value)) : apiError(c, 404, 'CREATOR_ANALYTICS_NOT_FOUND', 'Creator analytics were not found') } catch (error) { return creatorError(c, error) }
  })
  app.post('/v1/creator/ips/:ipProfileId/requests', async (c) => {
    if (noQuery(c)) return noQuery(c)!; const ipProfileId = parsedId(c, 'ipProfileId'); if (!ipProfileId) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const body = await strictJsonBody(c, requestBodySchema); if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    const input = CreatorRequestInputSchema.safeParse({ipProfileId, ...body}); if (!input.success) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    try { const human = await requireHuman(c, dependencies); if (!human.ok) return human.response; const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator; return c.json(CreatorRequestSchema.parse(await creator.createRequest(human.human.actor, input.data, {requestId: c.get('requestId')})), 201) } catch (error) { return creatorError(c, error) }
  })
  app.get('/v1/creator/requests', async (c) => {
    const query = strictQuery(c, pageQuerySchema); if (!query) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try { const human = await requireHuman(c, dependencies); if (!human.ok) return human.response; const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator; return c.json(CreatorRequestPageSchema.parse(await creator.listRequests(human.human.actor, pageInput(query)))) } catch (error) { return creatorError(c, error) }
  })
  app.get('/v1/creator/requests/:requestId', async (c) => {
    if (noQuery(c)) return noQuery(c)!; const id = parsedId(c, 'requestId'); if (!id) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    try { const human = await requireHuman(c, dependencies); if (!human.ok) return human.response; const creator = requireCreator(c, dependencies); if (creator instanceof Response) return creator; const value = await creator.getRequest(human.human.actor, id); return value ? c.json(CreatorRequestSchema.parse(value)) : apiError(c, 404, 'CREATOR_REQUEST_NOT_FOUND', 'Creator request was not found') } catch (error) { return creatorError(c, error) }
  })
}
