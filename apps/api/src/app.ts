import {Hono} from 'hono'
import {apiError} from './errors.js'
import {requestIdMiddleware, type ApiVariables} from './middleware/request-id.js'
import {registerHealthRoutes} from './routes/health.js'
import {registerAdminRoutes} from './routes/admin.js'
import {registerMeRoutes} from './routes/me.js'
import {registerSocialRoutes} from './routes/social.js'
import type {AuthVerifier} from './ports/auth.js'
import type {AuthorityPort} from './ports/authority.js'
import type {PlatformSocialPort} from './ports/platform-social.js'
import type {ProfilePort} from './ports/profiles.js'
import type {SocialPort} from './ports/social.js'

export type AppDependencies = {
  auth?: AuthVerifier
  authority?: AuthorityPort
  platformSocial?: PlatformSocialPort
  profiles?: ProfilePort
  social?: SocialPort
}

export const createApp = (dependencies: AppDependencies = {}) => {
  const app = new Hono<{Variables: ApiVariables}>()

  app.use('*', requestIdMiddleware)
  registerHealthRoutes(app)
  registerAdminRoutes(app, dependencies)
  registerMeRoutes(app, dependencies)
  registerSocialRoutes(app, dependencies)
  app.notFound((c) => apiError(c, 404, 'NOT_FOUND', 'Route not found'))
  app.onError((_error, c) => apiError(c, 500, 'INTERNAL_ERROR', 'Internal server error'))

  return app
}
