import {AccountSchema} from '@aifans/contracts'
import type {Hono} from 'hono'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ProfilePort} from '../ports/profiles.js'

type MeDependencies = {
  auth?: AuthVerifier
  profiles?: ProfilePort
}

export function registerMeRoutes(
  app: Hono<{Variables: ApiVariables}>,
  {auth, profiles}: MeDependencies,
) {
  app.get('/v1/me', async (c) => {
    if (!auth) return apiError(c, 503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured')
    if (!profiles) return apiError(c, 503, 'PROFILE_NOT_CONFIGURED', 'Profiles are not configured')

    const result = await auth.verify(c.req.raw)
    if (result.status === 'missing') return apiError(c, 401, 'AUTH_REQUIRED', 'Authentication is required')
    if (result.status === 'invalid' || !result.identity.subject.trim()) {
      return apiError(c, 401, 'AUTH_INVALID', 'Authentication is invalid')
    }

    await profiles.ensureHumanProfile({
      authSubject: result.identity.subject,
      ...(result.identity.email === undefined ? {} : {email: result.identity.email}),
      ...(result.identity.displayName === undefined ? {} : {displayName: result.identity.displayName}),
    })
    const account = await profiles.getCurrentAccount({subject: result.identity.subject})
    if (account === null) {
      return apiError(c, 500, 'PROFILE_NOT_AVAILABLE', 'Profile is not available')
    }

    return c.json(AccountSchema.parse(account), 200)
  })
}
