import {randomUUID} from 'node:crypto'
import {describe, expect, it} from 'vitest'
import {AnalyticsDeliveryError, createAnalyticsDeliveryWorker, type AnalyticsOutboxPort} from './analytics.js'

const eventId = randomUUID()
const events = [{
  id: randomUUID(), eventId, attemptCount: 2, occurredAt: '2026-09-01T01:02:03.456Z',
  payload: {event_id: eventId, event_name: 'account_registered' as const, event_version: 1 as const},
}]

function outbox(calls: unknown[]): AnalyticsOutboxPort {
  return {
    claim: async (input) => { calls.push(['claim', input]); return events },
    acknowledge: async (...input) => { calls.push(['ack', ...input]); return true },
    retry: async (...input) => { calls.push(['retry', ...input]); return true },
    fail: async (...input) => { calls.push(['fail', ...input]); return true },
  }
}

describe('analytics delivery worker', () => {
  it('claims a bounded lease and acknowledges successful capture', async () => {
    const calls: unknown[] = []
    const worker = createAnalyticsDeliveryWorker({
      outbox: outbox(calls), capture: {capture: async (event) => { calls.push(['capture', event.id]) }},
      createLeaseToken: () => '0f01ca22-115b-4abb-999f-3f41b2175512', leaseSeconds: 45,
    })
    await expect(worker.deliverBatch(999)).resolves.toEqual({claimed: 1, delivered: 1, retried: 0, failed: 0})
    expect(calls).toEqual([
      ['claim', {leaseToken: '0f01ca22-115b-4abb-999f-3f41b2175512', limit: 100, leaseSeconds: 45}],
      ['capture', events[0]!.id],
      ['ack', events[0]!.id, '0f01ca22-115b-4abb-999f-3f41b2175512'],
    ])
  })

  it('backs off transient failures and permanently closes rejected events', async () => {
    const transientCalls: unknown[] = []
    const transient = createAnalyticsDeliveryWorker({
      outbox: outbox(transientCalls), retryBaseSeconds: 10,
      createLeaseToken: () => '2fc21fb0-e91a-4644-8b2d-a690107c633c',
      capture: {capture: async () => { throw new AnalyticsDeliveryError('transient', 'provider_timeout') }},
    })
    await expect(transient.deliverBatch(1)).resolves.toEqual({claimed: 1, delivered: 0, retried: 1, failed: 0})
    expect(transientCalls).toContainEqual(['retry', events[0]!.id, '2fc21fb0-e91a-4644-8b2d-a690107c633c', 'provider_timeout', 40])

    const permanentCalls: unknown[] = []
    const permanent = createAnalyticsDeliveryWorker({
      outbox: outbox(permanentCalls), createLeaseToken: () => 'd35d60a8-e3dc-40ba-9ebf-84353d51217f',
      capture: {capture: async () => { throw new AnalyticsDeliveryError('permanent', 'provider_rejected') }},
    })
    await expect(permanent.deliverBatch(1)).resolves.toEqual({claimed: 1, delivered: 0, retried: 0, failed: 1})
    expect(permanentCalls).toContainEqual(['fail', events[0]!.id, 'd35d60a8-e3dc-40ba-9ebf-84353d51217f', 'provider_rejected'])
  })

  it('isolates unexpected provider failures as safe transient failures', async () => {
    const calls: unknown[] = []
    const worker = createAnalyticsDeliveryWorker({
      outbox: outbox(calls), createLeaseToken: () => 'f95ee634-478a-4cc7-b4ed-4d79d620421c',
      capture: {capture: async () => { throw new Error('provider secret') }},
    })
    await worker.deliverBatch(1)
    expect(calls).toContainEqual(['retry', events[0]!.id, 'f95ee634-478a-4cc7-b4ed-4d79d620421c', 'provider_unavailable', 120])
  })
})
