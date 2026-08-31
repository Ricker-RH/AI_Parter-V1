import {randomUUID} from 'node:crypto'
import type {AnalyticsOutboxEvent} from '@aifans/db'

export type AnalyticsCapturePort = {
  capture(event: AnalyticsOutboxEvent): Promise<void>
}

export type AnalyticsOutboxPort = {
  claim(input: {leaseToken: string; limit: number; leaseSeconds: number}): Promise<AnalyticsOutboxEvent[]>
  acknowledge(id: string, leaseToken: string): Promise<boolean>
  retry(id: string, leaseToken: string, code: string, retrySeconds: number): Promise<boolean>
  fail(id: string, leaseToken: string, code: string): Promise<boolean>
}

export type AnalyticsDeliverySummary = {
  claimed: number
  delivered: number
  retried: number
  failed: number
}

export type AnalyticsDeliveryWorker = {
  deliverBatch(limit: number): Promise<AnalyticsDeliverySummary>
}

export class AnalyticsDeliveryError extends Error {
  constructor(
    readonly kind: 'transient' | 'permanent',
    readonly code: 'provider_timeout' | 'provider_unavailable' | 'provider_rejected',
  ) {
    super('Analytics delivery failed')
    this.name = 'AnalyticsDeliveryError'
  }
}

export function createAnalyticsDeliveryWorker(input: {
  outbox: AnalyticsOutboxPort
  capture: AnalyticsCapturePort
  leaseSeconds?: number
  retryBaseSeconds?: number
  createLeaseToken?: () => string
}): AnalyticsDeliveryWorker {
  const leaseSeconds = input.leaseSeconds ?? 300
  const retryBaseSeconds = input.retryBaseSeconds ?? 30
  const createLeaseToken = input.createLeaseToken ?? randomUUID

  return {
    async deliverBatch(requestedLimit) {
      const limit = Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
      const leaseToken = createLeaseToken()
      const events = await input.outbox.claim({leaseToken, limit, leaseSeconds})
      const summary: AnalyticsDeliverySummary = {claimed: events.length, delivered: 0, retried: 0, failed: 0}

      for (const event of events) {
        try {
          await input.capture.capture(event)
          if (await input.outbox.acknowledge(event.id, leaseToken)) summary.delivered += 1
        } catch (cause) {
          const error = cause instanceof AnalyticsDeliveryError
            ? cause
            : new AnalyticsDeliveryError('transient', 'provider_unavailable')
          if (error.kind === 'permanent') {
            if (await input.outbox.fail(event.id, leaseToken, error.code)) summary.failed += 1
          } else {
            const retrySeconds = Math.min(86400, retryBaseSeconds * 2 ** Math.min(event.attemptCount, 10))
            if (await input.outbox.retry(event.id, leaseToken, error.code, retrySeconds)) summary.retried += 1
          }
        }
      }
      return summary
    },
  }
}
