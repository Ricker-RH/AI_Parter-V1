import {createHash, timingSafeEqual} from 'node:crypto'
import type {Hono} from 'hono'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AnalyticsDeliveryWorker} from '../ports/analytics.js'

type AnalyticsRouteDependencies = {
  analyticsWorker?: AnalyticsDeliveryWorker
  analyticsCronSecret?: string
}

function validSecret(header: string | undefined, expected: string): boolean {
  const actual = header?.startsWith('Bearer ') ? header.slice(7) : ''
  const actualDigest = createHash('sha256').update(actual).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(actualDigest, expectedDigest)
}

export function registerInternalAnalyticsRoutes(
  app: Hono<{Variables: ApiVariables}>,
  dependencies: AnalyticsRouteDependencies,
) {
  app.post('/internal/analytics/deliver', async (c) => {
    const worker = dependencies.analyticsWorker
    const secret = dependencies.analyticsCronSecret?.trim()
    if (!worker || !secret) return apiError(c, 503, 'ANALYTICS_NOT_CONFIGURED', 'Analytics delivery is not configured')
    if (!validSecret(c.req.header('authorization'), secret)) {
      return apiError(c, 401, 'UNAUTHORIZED', 'Unauthorized')
    }
    if (new URL(c.req.url).search) return apiError(c, 400, 'INVALID_REQUEST', 'Query parameters are not accepted')
    if ((await c.req.text()).length > 0) return apiError(c, 422, 'INVALID_REQUEST', 'Request body is not accepted')
    const result = await worker.deliverBatch(25)
    return c.json(result)
  })
}
