import {PostHog} from 'posthog-js'
import {describe, expect, it, vi} from 'vitest'
import {createAnalyticsEvent} from './contracts.js'
import {createPostHogInitOptions} from './provider.js'

const profileId = '11111111-1111-4111-8111-111111111111'
const postId = '22222222-2222-4222-8222-222222222222'

describe('real PostHog transport boundary', () => {
  it('sanitizes SDK-enriched capture data before it reaches the request queue', () => {
    window.history.replaceState({}, '', '/en/posts/id?access_token=private')
    const posthog = new PostHog()
    posthog.init('phc_public_key', {
      ...createPostHogInitOptions('https://eu.i.posthog.com'),
      opt_out_useragent_filter: true,
      persistence: 'memory',
      request_batching: false,
    })
    type FinalEvent = {event: string; properties: Record<string, unknown>}
    const finalEvents: FinalEvent[] = []
    const unsubscribe = (posthog as unknown as {_addCaptureHook: (callback: (_name: string, event: FinalEvent) => void) => () => void})._addCaptureHook((_name, event) => finalEvents.push(event))
    posthog.register({email: 'private@example.com', attachment: 'blob:https://aifans.example/private-object'})
    posthog.identify(profileId)
    finalEvents.length = 0

    const captured = posthog.capture('post_viewed', createAnalyticsEvent('post_viewed', {locale: 'en', post_id: postId}).properties)

    expect(captured).toBeDefined()
    expect(finalEvents).toHaveLength(1)
    expect(finalEvents[0]?.event).toBe('post_viewed')
    expect(finalEvents[0]?.properties).toEqual(expect.objectContaining({distinct_id: profileId, event_version: 1, locale: 'en', post_id: postId}))
    expect(JSON.stringify(finalEvents[0])).not.toMatch(/current_url|referrer|access_token|private@example|blob:|utm_/i)
    unsubscribe()
    posthog.reset()
  })
})
