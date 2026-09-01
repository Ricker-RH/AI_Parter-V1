import {AccountSchema, UpdateCurrentAccountSchema} from '@aifans/contracts'
import type {Context, Hono} from 'hono'
import {z} from 'zod'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ProfilePort} from '../ports/profiles.js'
import {strictJsonBody, strictQuery} from './strict-input.js'

type ApiContext = Context<{Variables: ApiVariables}>
const EmptyQuerySchema = z.strictObject({})
const PATCH_BODY_LIMIT = 65_536

type MeDependencies = {
  auth?: AuthVerifier
  profiles?: ProfilePort
}

export function registerMeRoutes(
  app: Hono<{Variables: ApiVariables}>,
  {auth, profiles}: MeDependencies,
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

  app.get('/v1/me', async (c) => {
    if (strictQuery(c, EmptyQuerySchema) === null) return apiError(c, 400, 'INVALID_REQUEST', 'Request is invalid')
    const authenticated = await authenticate(c)
    if ('response' in authenticated) return authenticated.response
    const repository = profileRepository!
    const subject = authenticated.subject

    await repository.ensureHumanProfile({
      authSubject: subject,
      ...(authenticated.identity.email === undefined ? {} : {email: authenticated.identity.email}),
      ...(authenticated.identity.displayName === undefined ? {} : {displayName: authenticated.identity.displayName}),
    })
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
    const contentLength = c.req.header('content-length')
    if (contentLength !== undefined && (!/^\d+$/.test(contentLength) || Number(contentLength) > PATCH_BODY_LIMIT)) return apiError(c, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large')
    const body = await strictJsonBody(c, UpdateCurrentAccountSchema)
    if (!body) return apiError(c, 422, 'INVALID_REQUEST', 'Request is invalid')
    if (!profileRepository || !profileRepository.updateCurrentAccount) return apiError(c, 503, 'PROFILE_NOT_CONFIGURED', 'Profiles are not configured')
    const repository = profileRepository
    const updateCurrentAccount = repository.updateCurrentAccount!
    try {
      await repository.ensureHumanProfile({authSubject: authenticated.subject, ...(authenticated.identity.email === undefined ? {} : {email: authenticated.identity.email}), ...(authenticated.identity.displayName === undefined ? {} : {displayName: authenticated.identity.displayName})})
      const account = await updateCurrentAccount({subject: authenticated.subject}, body)
      if (account === null) return apiError(c, 500, 'PROFILE_NOT_AVAILABLE', 'Profile is not available')
      return c.json(AccountSchema.parse(account), 200)
    } catch (error) {
      const candidate = error as {code?: unknown; constraint?: unknown}
      if (candidate.code === '23505' && candidate.constraint === 'profiles_username_unique') {
        return apiError(c, 409, 'USERNAME_TAKEN', 'Username is already taken')
      }
      if (candidate.code === '23514' || candidate.code === '22P02') {
        return apiError(c, 422, 'PROFILE_INVALID', 'Profile fields are invalid')
      }
      throw error
    }
  })
}
