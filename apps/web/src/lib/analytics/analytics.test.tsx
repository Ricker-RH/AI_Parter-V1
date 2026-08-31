import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {
  ANALYTICS_EVENT_NAMES,
  MAX_SEARCH_QUERY_LENGTH,
  createAnalyticsEvent,
  createAnalyticsPage,
  type AnalyticsClient,
} from './contracts.js'
import {trackChatOpened, trackFeedTabSelected} from './events.js'
import {AnalyticsProvider, createPostHogAnalytics, routeNameForPath, useAnalytics, type PostHogSdk} from './provider.js'

vi.mock('next/navigation', () => ({usePathname: () => '/en'}))

const profileId = '11111111-1111-4111-8111-111111111111'
const postId = '22222222-2222-4222-8222-222222222222'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('analytics event contract', () => {
  it('has exactly the approved initial custom-event allow-list and event version', () => {
    expect(ANALYTICS_EVENT_NAMES).toEqual([
      'landing_viewed',
      'sign_up_started',
      'sign_in_started',
      'feed_tab_selected',
      'search_performed',
      'ip_profile_viewed',
      'post_viewed',
      'creator_center_viewed',
      'ip_creation_step_viewed',
      'generation_requested',
      'master_image_selected',
      'submission_clicked',
      'chat_opened',
    ])
    expect(createAnalyticsEvent('landing_viewed', {locale: 'en', route_name: '/[locale]'})).toEqual({
      name: 'landing_viewed',
      properties: {event_version: 1, locale: 'en', route_name: '/[locale]'},
    })
  })

  it('rejects unknown event names and non-allow-listed or sensitive properties', () => {
    expect(() => createAnalyticsEvent('not_approved' as never, {} as never)).toThrow('Unknown analytics event')
    expect(() => createAnalyticsEvent('search_performed', {category: 'all', query_length: 3, query: 'raw query'} as never)).toThrow('not allowed')
    expect(() => createAnalyticsEvent('chat_opened', {ip_profile_id: profileId, message: 'private message'} as never)).toThrow('not allowed')
    expect(() => createAnalyticsEvent('post_viewed', {post_id: postId, post_body: 'private post'} as never)).toThrow('not allowed')
    expect(() => createAnalyticsEvent('post_viewed', {post_id: postId, comment_body: 'private comment'} as never)).toThrow('not allowed')
    expect(() => createAnalyticsEvent('generation_requested', {prompt: 'private prompt', visual_type: 'portrait'} as never)).toThrow('not allowed')
    expect(() => createAnalyticsEvent('post_viewed', {locale: 'en'} as never)).toThrow('invalid')
    expect(() => createAnalyticsEvent('landing_viewed', {locale: 'en', route_name: '/[locale]?email=private@example.com'} as never)).toThrow('invalid')
    expect(() => createAnalyticsEvent('creator_center_viewed', {locale: 'en', route_name: 'https://secret.example/[locale]'} as never)).toThrow('invalid')
    expect(() => createAnalyticsEvent('sign_up_started', {locale: 'en', action_source: 'https://secret.example'} as never)).toThrow('invalid')
    expect(() => createAnalyticsEvent('ip_creation_step_viewed', {locale: 'en', creation_step: 'private persona prompt'} as never)).toThrow('invalid')
    expect(() => createAnalyticsEvent('generation_requested', {locale: 'en', visual_type: 'https://private-image.example'} as never)).toThrow('invalid')
    expect(() => createAnalyticsEvent('search_performed', {category: 'all', locale: 'en', query_length: MAX_SEARCH_QUERY_LENGTH + 1} as never)).toThrow('invalid')
  })

  it('allows only static route templates in custom events and PostHog system page views', () => {
    expect(createAnalyticsPage({locale: 'en', route_name: '/[locale]/posts/[postId]'})).toEqual({event_version: 1, locale: 'en', route_name: '/[locale]/posts/[postId]'})
    expect(() => createAnalyticsPage({locale: 'en', route_name: '/[locale]#private'} as never)).toThrow('invalid')
    expect(() => createAnalyticsPage({locale: 'en', route_name: '/en/posts/11111111-1111-4111-8111-111111111111'} as never)).toThrow('invalid')
  })

  it('emits only allow-listed chat and feed intent data', () => {
    const capture = vi.fn()
    const analytics: AnalyticsClient = {capture, identify: vi.fn(), page: vi.fn(), reset: vi.fn()}
    trackFeedTabSelected(analytics, {feed: 'following', locale: 'zh-CN'})
    trackChatOpened(analytics, {ipProfileId: profileId, locale: 'en'})
    expect(capture).toHaveBeenNthCalledWith(1, createAnalyticsEvent('feed_tab_selected', {feed: 'following', locale: 'zh-CN'}))
    expect(capture).toHaveBeenNthCalledWith(2, createAnalyticsEvent('chat_opened', {ip_profile_id: profileId, locale: 'en'}))
    expect(JSON.stringify(capture.mock.calls)).not.toMatch(/message|search|post_body|comment_body|prompt/i)
  })
})

describe('PostHog browser adapter', () => {
  it('is a complete no-op when its public project key is absent', async () => {
    const load = vi.fn()
    const analytics = createPostHogAnalytics({key: undefined, load})
    await analytics.capture(createAnalyticsEvent('landing_viewed', {locale: 'en', route_name: '/[locale]'}))
    await analytics.identify(profileId)
    await analytics.reset()
    await analytics.page(createAnalyticsPage({locale: 'en', route_name: '/[locale]'}))
    expect(load).not.toHaveBeenCalled()
  })

  it('initializes lazily with broad autocapture and automatic page views disabled', async () => {
    const sdk: PostHogSdk = {capture: vi.fn(), identify: vi.fn(), init: vi.fn(), reset: vi.fn()}
    const load = vi.fn(async () => sdk)
    const analytics = createPostHogAnalytics({key: 'phc_public_key', host: 'https://eu.i.posthog.com', load})
    await analytics.capture(createAnalyticsEvent('post_viewed', {locale: 'en', post_id: postId}))
    expect(load).toHaveBeenCalledTimes(1)
    expect(sdk.init).toHaveBeenCalledWith('phc_public_key', {
      api_host: 'https://eu.i.posthog.com',
      autocapture: false,
      capture_pageleave: false,
      capture_pageview: false,
    })
    expect(sdk.capture).toHaveBeenCalledWith('post_viewed', {event_version: 1, locale: 'en', post_id: postId})
    await analytics.page(createAnalyticsPage({locale: 'en', route_name: '/[locale]/posts/[postId]'}))
    expect(sdk.capture).toHaveBeenLastCalledWith('$pageview', {event_version: 1, locale: 'en', route_name: '/[locale]/posts/[postId]'})
  })

  it('identifies only a stable profile UUID and resets identity on logout', async () => {
    const sdk: PostHogSdk = {capture: vi.fn(), identify: vi.fn(), init: vi.fn(), reset: vi.fn()}
    const analytics = createPostHogAnalytics({key: 'phc_public_key', load: async () => sdk})
    await analytics.identify('not-a-profile-id')
    expect(sdk.identify).not.toHaveBeenCalled()
    await analytics.identify(profileId)
    await analytics.reset()
    expect(sdk.identify).toHaveBeenCalledWith(profileId)
    expect(sdk.reset).toHaveBeenCalledTimes(1)
  })

  it('isolates provider load and SDK failures from product interactions', async () => {
    const analytics = createPostHogAnalytics({key: 'phc_public_key', load: async () => { throw new Error('provider unavailable') }})
    await expect(analytics.capture(createAnalyticsEvent('landing_viewed', {locale: 'en', route_name: '/[locale]'}))).resolves.toBeUndefined()

    const failing: AnalyticsClient = {
      capture: () => { throw new Error('capture failed') },
      identify: () => { throw new Error('identify failed') },
      page: () => { throw new Error('page failed') },
      reset: () => { throw new Error('reset failed') },
    }
    function Button() {
      const client = useAnalytics()
      return <button onClick={() => trackFeedTabSelected(client, {feed: 'for_you', locale: 'en'})}>Select feed</button>
    }
    render(<AnalyticsProvider analytics={failing} locale="en"><Button /></AnalyticsProvider>)
    expect(() => fireEvent.click(screen.getByRole('button', {name: 'Select feed'}))).not.toThrow()
    await flush()
  })

  it('uses route templates rather than entity IDs in explicit page-view properties', () => {
    expect(routeNameForPath('/en')).toBe('/[locale]')
    expect(routeNameForPath(`/zh-CN/posts/${postId}`)).toBe('/[locale]/posts/[postId]')
    expect(routeNameForPath('/en/messages')).toBe('/[locale]/messages')
    expect(routeNameForPath('/en?email=private@example.com')).toBeNull()
  })

  it('identifies the passed profile UUID and resets the browser identity when signed out', async () => {
    const analytics: AnalyticsClient = {capture: vi.fn(), identify: vi.fn(), page: vi.fn(), reset: vi.fn()}
    const {rerender} = render(<AnalyticsProvider analytics={analytics} locale="en" profileId={profileId}><div>Signed in</div></AnalyticsProvider>)
    await waitFor(() => expect(analytics.identify).toHaveBeenCalledWith(profileId))
    expect(analytics.reset).not.toHaveBeenCalled()
    expect(analytics.page).toHaveBeenCalledWith({event_version: 1, locale: 'en', route_name: '/[locale]'})
    expect(analytics.capture).toHaveBeenCalledWith({name: 'landing_viewed', properties: {event_version: 1, locale: 'en', route_name: '/[locale]'}})
    rerender(<AnalyticsProvider analytics={analytics} locale="en"><div>Signed out</div></AnalyticsProvider>)
    await waitFor(() => expect(analytics.reset).toHaveBeenCalledTimes(1))
  })
})
