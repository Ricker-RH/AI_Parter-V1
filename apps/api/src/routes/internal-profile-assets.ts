import {createHash, timingSafeEqual} from 'node:crypto'
import type {Hono} from 'hono'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'

export type ProfileAssetCleanupWorker = {run(): Promise<{processed: number; deleted: number; failed: number}>}

export function registerInternalProfileAssetRoutes(
  app: Hono<{Variables: ApiVariables}>,
  dependencies: {profileAssetCleanup?: ProfileAssetCleanupWorker; profileAssetCleanupSecret?: string},
) {
  app.post('/internal/profile-assets/cleanup', async c => {
    const worker = dependencies.profileAssetCleanup
    const secret = dependencies.profileAssetCleanupSecret
    if (!worker || !secret) return apiError(c, 503, 'PROFILE_CLEANUP_NOT_CONFIGURED', 'Profile cleanup is not configured')
    const actual = c.req.header('authorization') ?? ''
    if (!timingSafeEqual(createHash('sha256').update(actual).digest(),
      createHash('sha256').update(`Bearer ${secret}`).digest())) {
      return apiError(c, 401, 'UNAUTHORIZED', 'Unauthorized')
    }
    if (new URL(c.req.url).search) return apiError(c, 400, 'INVALID_REQUEST', 'Query parameters are not accepted')
    if ((await c.req.text()).length > 0) return apiError(c, 422, 'INVALID_REQUEST', 'Request body is not accepted')
    return c.json(await worker.run())
  })
}
