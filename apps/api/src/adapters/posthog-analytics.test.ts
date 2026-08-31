import {randomUUID} from 'node:crypto'
import {describe, expect, it, vi} from 'vitest'
import {createPostHogAnalyticsCapture, postHogAnalyticsCaptureFromEnv} from './posthog-analytics.js'
import {AnalyticsDeliveryError} from '../ports/analytics.js'

const eventId = randomUUID()
const event = {
  id: randomUUID(), eventId, attemptCount: 0, occurredAt: '2026-09-01T01:02:03.456Z',
  actorProfileId: 'd175193f-619f-4556-b6ac-435ed8143817', distinctId: 'd175193f-619f-4556-b6ac-435ed8143817',
  payload: {event_id: eventId, event_name: 'account_registered' as const, event_version: 1 as const},
}

describe('PostHog analytics capture adapter', () => {
  it('sends the exact closed payload with stable idempotency identity', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({status: 1}), {status: 200}))
    const capture = createPostHogAnalyticsCapture({projectKey: 'phc_project', host: 'https://eu.i.posthog.com', fetcher})
    await capture.capture(event)

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://eu.i.posthog.com/capture/')
    expect(init).toMatchObject({method: 'POST', headers: {'content-type': 'application/json'}})
    expect(JSON.parse(String(init?.body))).toEqual({
      api_key: 'phc_project',
      event: 'account_registered',
      timestamp: '2026-09-01T01:02:03.456Z',
      properties: {
        event_id: eventId, event_name: 'account_registered', event_version: 1,
        distinct_id: event.distinctId, $insert_id: eventId,
      },
    })
    expect(init?.redirect).toBe('error')
  })

  it.each([
    [429, 'transient'], [500, 'transient'], [400, 'permanent'], [401, 'permanent'],
  ] as const)('classifies HTTP %s as %s without leaking provider response', async (status, kind) => {
    const capture = createPostHogAnalyticsCapture({
      projectKey: 'phc_project', host: 'https://us.i.posthog.com',
      fetcher: async () => new Response('provider secret detail', {status}),
    })
    const error = await capture.capture(event).catch((value) => value)
    expect(error).toBeInstanceOf(AnalyticsDeliveryError)
    expect(error).toMatchObject({kind})
    expect(String(error)).not.toContain('provider secret detail')
  })

  it('classifies timeout/network failures as transient', async () => {
    const capture = createPostHogAnalyticsCapture({
      projectKey: 'phc_project', host: 'https://us.i.posthog.com', timeoutMs: 1,
      fetcher: async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
    })
    await expect(capture.capture(event)).rejects.toMatchObject({kind: 'transient', code: 'provider_timeout'})
  })

  it('is safely unconfigured unless both server settings are valid', () => {
    expect(postHogAnalyticsCaptureFromEnv({})).toBeUndefined()
    expect(postHogAnalyticsCaptureFromEnv({POSTHOG_API_KEY: 'secret'})).toBeUndefined()
    expect(postHogAnalyticsCaptureFromEnv({POSTHOG_API_KEY: 'secret', POSTHOG_HOST: 'javascript:alert(1)'})).toBeUndefined()
    expect(postHogAnalyticsCaptureFromEnv({POSTHOG_API_KEY: 'secret', POSTHOG_HOST: 'https://us.i.posthog.com'})).toBeDefined()
  })
})
