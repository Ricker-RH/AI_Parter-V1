import type {Hono} from 'hono'
import type {ApiVariables} from '../middleware/request-id.js'

export const registerHealthRoutes = (app: Hono<{Variables: ApiVariables}>) => {
  app.get('/health', (c) => c.json({status: 'ok', service: 'aifans-api'}))
}
