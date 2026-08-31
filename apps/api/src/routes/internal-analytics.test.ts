import {describe, expect, it} from 'vitest'
import {createApp} from '../app.js'
import type {AnalyticsDeliveryWorker} from '../ports/analytics.js'

function worker(calls: number[] = []): AnalyticsDeliveryWorker {
  return {deliverBatch: async (limit) => { calls.push(limit); return {claimed: 2, delivered: 1, retried: 1, failed: 0} }}
}

describe('POST /internal/analytics/deliver', () => {
  it('returns safe 503 when delivery is not configured', async () => {
    const response = await createApp().request('/internal/analytics/deliver', {method: 'POST'})
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({code: 'ANALYTICS_NOT_CONFIGURED'})
  })

  it('requires an exact cron bearer secret and accepts no body or query', async () => {
    const calls: number[] = []
    const app = createApp({analyticsWorker: worker(calls), analyticsCronSecret: 'cron-secret'})
    const missing = await app.request('/internal/analytics/deliver', {method: 'POST'})
    const wrong = await app.request('/internal/analytics/deliver', {method: 'POST', headers: {authorization: 'Bearer wrong'}})
    expect(missing.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(await missing.json()).toMatchObject({code: 'UNAUTHORIZED', message: 'Unauthorized'})
    expect(await wrong.json()).toMatchObject({code: 'UNAUTHORIZED', message: 'Unauthorized'})
    expect((await app.request('/internal/analytics/deliver?limit=999', {method: 'POST', headers: {authorization: 'Bearer cron-secret'}})).status).toBe(400)
    expect((await app.request('/internal/analytics/deliver', {method: 'POST', headers: {authorization: 'Bearer cron-secret', 'content-type': 'application/json'}, body: '{}'})).status).toBe(422)
    expect(calls).toEqual([])
  })

  it('runs one server-bounded delivery batch and returns counts', async () => {
    const calls: number[] = []
    const response = await createApp({analyticsWorker: worker(calls), analyticsCronSecret: 'cron-secret'}).request('/internal/analytics/deliver', {
      method: 'POST', headers: {authorization: 'Bearer cron-secret'},
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({claimed: 2, delivered: 1, retried: 1, failed: 0})
    expect(calls).toEqual([25])
  })

  it('does not leak worker errors or the configured secret', async () => {
    const response = await createApp({
      analyticsCronSecret: 'do-not-leak',
      analyticsWorker: {deliverBatch: async () => { throw new Error('provider leaked secret') }},
    }).request('/internal/analytics/deliver', {method: 'POST', headers: {authorization: 'Bearer do-not-leak'}})
    const raw = await response.text()
    expect(response.status).toBe(500)
    expect(raw).not.toContain('provider leaked secret')
    expect(raw).not.toContain('do-not-leak')
  })
})
