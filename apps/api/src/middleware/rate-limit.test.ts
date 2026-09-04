import {Hono} from 'hono'
import {describe, expect, it} from 'vitest'
import {rateLimitMiddleware} from './rate-limit.js'
import {requestIdMiddleware, type ApiVariables} from './request-id.js'

describe('human chat baseline rate limiting', () => {
  it.each([
    ['POST', '/v1/human-chat/peers/peer/messages'],
    ['GET', '/v1/human-chat/conversations/conversation/messages'],
    ['POST', '/v1/human-chat/conversations/conversation/read'],
    ['POST', '/v1/human-chat/conversations'],
    ['GET', '/v1/human-chat/conversations'],
    ['POST', '/v1/realtime/ticket'],
    ['PUT', '/v1/humans/peer/follow'],
    ['DELETE', '/v1/humans/peer/block'],
    ['PATCH', '/v1/human-preferences'],
  ])('fails closed when required limiter is absent: %s %s', async (method, path) => {
    const app = new Hono<{Variables: ApiVariables}>()
    app.use('*', requestIdMiddleware)
    app.use('*', rateLimitMiddleware({required: true}))
    app.all('*', (c) => c.json({unsafe: true}))
    const response = await app.request(path, {method})
    expect(response.status).toBe(503)
    expect(await response.text()).toContain('RATE_LIMIT_NOT_CONFIGURED')
  })
})
