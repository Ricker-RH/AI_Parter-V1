import {
  AccountSchema,
  ProfileAssetConfirmationRequestSchema,
  ProfileAssetConfirmationResponseSchema,
  ProfileAssetIntentRequestSchema,
  ProfileAssetIntentSchema,
  UpdateCurrentAccountSchema,
} from '@aifans/contracts'
import type {Context, Hono} from 'hono'
import {z} from 'zod'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ProfileAssetPort} from '../ports/profile-assets.js'
import type {ProfilePort} from '../ports/profiles.js'
import {strictJsonBody, strictQuery} from './strict-input.js'

type ApiContext = Context<{Variables: ApiVariables}>
const EmptyQuerySchema = z.strictObject({})
const BODY_LIMIT = 65_536
const IdSchema = z.uuid()

type MeDependencies = {
  auth?: AuthVerifier
  profiles?: ProfilePort
  profileAssets?: ProfileAssetPort
}

export function registerMeRoutes(
  app: Hono<{Variables: ApiVariables}>,
  {auth, profiles, profileAssets}: MeDependencies,
) {
  const profileRepository = profiles
  async function authenticate(c: ApiContext) {
    if (!auth) return {response: apiError(c, 503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured')}
    if (!profileRepository) return {response: apiError(c, 503, 'PROFILE_NOT_CONFIGURED', 'Profiles are not configured')}
    const result = await auth.verify(c.req.raw)
    if (result.status === 'missing') return {response: apiError(c, 401, 'AUTH_REQUIRED', 'Authentication is required')}
    if (result.status === 'invalid' || !result.identity.subject.trim()) {
      return {response: apiError(c, 401, 'AUTH_INVALID', 'Authentication is invalid')}
    }
    return {subject: result.identity.subject, identity: result.identity}
  }

  function payloadTooLarge(c: ApiContext): Response | null {
    const contentLength = c.req.header('content-length')
    return contentLength !== undefined && (!/^\d+$/.test(contentLength) || Number(contentLength) > BODY_LIMIT)
      ? apiError(c, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large')
      : null
  }

  async function provision(authenticated: {subject: string; identity: {email?: string | null; displayName?: string | null}}) {
    await profileRepository!.ensureHumanProfile({
      authSubject: authenticated.subject,
      ...(authenticated.identity.email === undefined ? {} : {email: authenticated.identity.email}),
      ...(authenticated.identity.displayName === undefined ? {} : {displayName: authenticated.identity.displayName}),
    })
  }

  function profileError(c: ApiContext, error: unknown): Response {
    const candidate = error as {code?: unknown; constraint?: unknown; message?: unknown}
    const code = typeof candidate.code === 'string' ? candidate.code : undefined
    const message = typeof candidate.message === 'string' ? candidate.message : ''
    if (code === 'PROFILE_VERSION_CONFLICT') {
      return apiError(c, 409, 'PROFILE_VERSION_CONFLICT', 'The profile was changed by another request')
    }
    if (code === 'PROFILE_ASSET_UNAVAILABLE') {
      return apiError(c, 422, 'PROFILE_ASSET_UNAVAILABLE', 'The selected profile asset is unavailable')
    }
    if (message.startsWith('PROFILE_ASSET_NOT_FOUND')) {
      return apiError(c, 409, 'PROFILE_ASSET_NOT_READY', 'The profile asset upload is not ready')
    }
    if (message.startsWith('PROFILE_ASSET_INVALID')) {
      return apiError(c, 422, 'PROFILE_ASSET_INVALID', 'The profile asset upload is invalid')
    }
    if (code === '23505' && candidate.constraint === 'profiles_username_unique') {
      return apiError(c, 409, 'USERNAME_TAKEN', 'Username is already taken')
    }
    if (code === '23514' || code === '22P02') {
      return apiError(c, 422, 'PROFILE_INVALID', 'Profile fields are invalid')
    }
    throw error
  }

  app.get('/v1/me', async (c) => {
    if (strictQuery(c, EmptyQuerySchema) === null) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const authenticated = await authenticate(c)
    if ('response' in authenticated) return authenticated.response
    const repository = profileRepository!
    const subject = authenticated.subject

    await provision(authenticated)
    const account = await repository.getCurrentAccount({subject})
    if (account === null) {
      return apiError(c, 500, 'PROFILE_NOT_AVAILABLE', 'Profile is not available')
    }

    return c.json(AccountSchema.parse(account), 200)
  })

  app.patch('/v1/me', async (c) => {
    const authenticated = await authenticate(c)
    if ('response' in authenticated) return authenticated.response
    if (strictQuery(c, EmptyQuerySchema) === null) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const sizeError = payloadTooLarge(c)
    if (sizeError) return sizeError
    const body = await strictJsonBody(c, UpdateCurrentAccountSchema)
    if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    if (!profileRepository || !profileRepository.updateCurrentAccount) return apiError(c, 503, 'PROFILE_NOT_CONFIGURED', 'Profiles are not configured')
    const repository = profileRepository
    const updateCurrentAccount = repository.updateCurrentAccount!
    try {
      await provision(authenticated)
      const account = await updateCurrentAccount({subject: authenticated.subject}, body)
      if (account === null) return apiError(c, 500, 'PROFILE_NOT_AVAILABLE', 'Profile is not available')
      return c.json(AccountSchema.parse(account), 200)
    } catch (error) {
      return profileError(c, error)
    }
  })

  app.post('/v1/me/assets/upload-intent', async (c) => {
    const authenticated = await authenticate(c)
    if ('response' in authenticated) return authenticated.response
    if (!profileAssets) return apiError(c, 503, 'PROFILE_ASSETS_NOT_CONFIGURED', 'Profile asset storage is not configured')
    if (strictQuery(c, EmptyQuerySchema) === null) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const sizeError = payloadTooLarge(c)
    if (sizeError) return sizeError
    const body = await strictJsonBody(c, ProfileAssetIntentRequestSchema)
    if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    if (!profileRepository?.reserveProfileAsset) return apiError(c, 503, 'PROFILE_NOT_CONFIGURED', 'Profiles are not configured')
    try {
      await provision(authenticated)
      const reservation = await profileRepository.reserveProfileAsset({subject: authenticated.subject}, body)
      const intent = await profileAssets.createUploadIntent({
        objectKey: reservation.objectKey,
        contentType: reservation.contentType,
        sizeBytes: reservation.sizeBytes,
        expiresAt: reservation.expiresAt,
      })
      return c.json(ProfileAssetIntentSchema.parse({assetId: reservation.id, ...intent}), 201)
    } catch (error) {
      return profileError(c, error)
    }
  })

  app.post('/v1/me/assets/:assetId/confirm', async (c) => {
    const authenticated = await authenticate(c)
    if ('response' in authenticated) return authenticated.response
    if (!profileAssets) return apiError(c, 503, 'PROFILE_ASSETS_NOT_CONFIGURED', 'Profile asset storage is not configured')
    if (strictQuery(c, EmptyQuerySchema) === null) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const pathId = IdSchema.safeParse(c.req.param('assetId'))
    if (!pathId.success) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const sizeError = payloadTooLarge(c)
    if (sizeError) return sizeError
    const body = await strictJsonBody(c, ProfileAssetConfirmationRequestSchema)
    if (!body || body.assetId !== pathId.data) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    if (!profileRepository?.getProfileAssetReservation || !profileRepository.confirmProfileAsset) {
      return apiError(c, 503, 'PROFILE_NOT_CONFIGURED', 'Profiles are not configured')
    }
    try {
      await provision(authenticated)
      const actor = {subject: authenticated.subject}
      const reservation = await profileRepository.getProfileAssetReservation(actor, pathId.data)
      if (!reservation) return apiError(c, 404, 'PROFILE_ASSET_NOT_FOUND', 'Profile asset was not found')
      await profileAssets.inspectUpload({
        objectKey: reservation.objectKey,
        contentType: reservation.contentType,
        sizeBytes: reservation.sizeBytes,
      })
      const confirmed = await profileRepository.confirmProfileAsset(actor, pathId.data)
      if (!confirmed) return apiError(c, 409, 'PROFILE_ASSET_EXPIRED', 'Profile asset reservation expired')
      return c.json(ProfileAssetConfirmationResponseSchema.parse({assetId: confirmed.id, role: confirmed.role}), 200)
    } catch (error) {
      return profileError(c, error)
    }
  })
}
