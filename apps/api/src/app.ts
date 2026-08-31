import {Hono} from 'hono'
import {apiError} from './errors.js'
import {requestIdMiddleware, type ApiVariables} from './middleware/request-id.js'
import {registerHealthRoutes} from './routes/health.js'

export type AppDependencies = object

export const createApp = (_dependencies: AppDependencies = {}) => {
  const app = new Hono<{Variables: ApiVariables}>()

  app.use('*', requestIdMiddleware)
  registerHealthRoutes(app)
  app.notFound((c) => apiError(c, 404, 'NOT_FOUND', 'Route not found'))
  app.onError((_error, c) => apiError(c, 500, 'INTERNAL_ERROR', 'Internal server error'))

  return app
}
