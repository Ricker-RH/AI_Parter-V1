import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
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

afterEach(() => vi.unstubAllGlobals())

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
      'performance_measured',
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

  it('uses only the approved creator visual categories', () => {
    for (const visual_type of ['realistic', 'anime', 'hybrid'] as const) {
      expect(createAnalyticsEvent('generation_requested', {locale: 'en', visual_type}).properties.visual_type).toBe(visual_type)
    }
    expect(() => createAnalyticsEvent('generation_requested', {locale: 'en', visual_type: 'avatar'} as never)).toThrow('invalid')
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
    const init = vi.fn()
    const sdk: PostHogSdk = {capture: vi.fn(), identify: vi.fn(), init, reset: vi.fn()}
    const load = vi.fn(async () => sdk)
    const analytics = createPostHogAnalytics({key: 'phc_public_key', host: 'https://eu.i.posthog.com', load})
    await analytics.capture(createAnalyticsEvent('post_viewed', {locale: 'en', post_id: postId}))
    expect(load).toHaveBeenCalledTimes(1)
    expect(sdk.init).toHaveBeenCalledWith('phc_public_key', expect.objectContaining({
      api_host: 'https://eu.i.posthog.com',
      advanced_disable_flags: true,
      advanced_disable_toolbar_metrics: true,
      autocapture: false,
      before_send: expect.any(Function),
      capture_exceptions: false,
      capture_pageleave: false,
      capture_pageview: false,
      capture_performance: false,
      disable_session_recording: true,
      disable_conversations: true,
      disable_product_tours: true,
      disable_surveys: true,
      disable_surveys_automatic_display: true,
      disable_web_experiments: true,
      mask_all_element_attributes: true,
      mask_all_text: true,
      property_denylist: expect.arrayContaining(['$current_url', '$referrer', 'utm_campaign', 'email', 'cookie', 'access_token']),
      save_campaign_params: false,
      save_referrer: false,
    }))
    expect(sdk.capture).toHaveBeenCalledWith('post_viewed', {event_version: 1, locale: 'en', post_id: postId})
    const beforeSend = (init.mock.calls[0]?.[1] as {before_send?: (event: unknown) => unknown}).before_send
    const enriched = {
      uuid: '33333333-3333-4333-8333-333333333333', event: 'post_viewed',
      properties: {
        token: 'phc_public_key', distinct_id: profileId, $session_id: '44444444-4444-4444-8444-444444444444', $device_type: 'Desktop',
        event_version: 1, locale: 'en', post_id: postId,
        $current_url: 'https://aifans.example/en/posts/id?access_token=private', $referrer: 'https://mail.example/private', $pathname: '/private/path',
        utm_campaign: 'private-email-campaign', email: 'private@example.com', cookie: 'session=private', access_token: 'private', attachment: 'blob:https://aifans.example/private-object',
      },
      $set: {email: 'private@example.com'}, $set_once: {$initial_current_url: 'https://aifans.example/?token=private'},
    }
    expect(beforeSend?.(enriched)).toEqual({
      uuid: enriched.uuid, event: 'post_viewed',
      properties: {token: 'phc_public_key', distinct_id: profileId, $session_id: '44444444-4444-4444-8444-444444444444', $device_type: 'Desktop', event_version: 1, locale: 'en', post_id: postId},
    })
    expect(beforeSend?.({
      uuid: enriched.uuid,
      event: '$pageview',
      properties: {
        token: 'phc_public_key', distinct_id: profileId, $session_id: '44444444-4444-4444-8444-444444444444',
        event_version: 1, locale: 'en', route_name: '/[locale]/posts/[postId]',
        $current_url: 'https://aifans.example/en/posts/id?token=private', $referrer: 'https://mail.example/private',
        utm_source: 'private-campaign', email: 'private@example.com', attachment: 'blob:https://aifans.example/private-object',
      },
    })).toEqual({
      uuid: enriched.uuid, event: '$pageview',
      properties: {token: 'phc_public_key', distinct_id: profileId, $session_id: '44444444-4444-4444-8444-444444444444', event_version: 1, locale: 'en', route_name: '/[locale]/posts/[postId]'},
    })
    expect(beforeSend?.({...enriched, event: 'sdk_unapproved_event'})).toBeNull()
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
    expect(routeNameForPath('/en/activity')).toBe('/[locale]/activity')
    expect(routeNameForPath('/zh-CN/liked')).toBe('/[locale]/liked')
    expect(routeNameForPath('/en?email=private@example.com')).toBeNull()
  })

  it('identifies before flushing initial events and handles authenticated-to-anonymous transitions in a persistent layout', async () => {
    const fetchAccount = vi.fn()
      .mockResolvedValueOnce(Response.json({profileId}))
      .mockResolvedValueOnce(new Response(null, {status: 204}))
    vi.stubGlobal('fetch', fetchAccount)
    const order: string[] = []
    const analytics: AnalyticsClient = {
      capture: vi.fn(async (event) => { order.push(`capture:${event.name}`) }),
      identify: vi.fn(async (id) => { order.push(`identify:${id}`) }),
      page: vi.fn(async () => { order.push('page') }),
      reset: vi.fn(async () => { order.push('reset') }),
    }
    render(<AnalyticsProvider analytics={analytics} locale="en"><div>Signed in</div></AnalyticsProvider>)
    expect(analytics.page).not.toHaveBeenCalled()
    expect(analytics.capture).not.toHaveBeenCalled()
    await waitFor(() => expect(analytics.identify).toHaveBeenCalledWith(profileId))
    expect(analytics.reset).not.toHaveBeenCalled()
    expect(analytics.page).toHaveBeenCalledWith({event_version: 1, locale: 'en', route_name: '/[locale]'})
    expect(analytics.capture).toHaveBeenCalledWith({name: 'landing_viewed', properties: {event_version: 1, locale: 'en', route_name: '/[locale]'}})
    expect(order).toEqual([`identify:${profileId}`, 'page', 'capture:landing_viewed'])

    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(analytics.reset).toHaveBeenCalledTimes(1))
    expect(fetchAccount).toHaveBeenCalledTimes(2)
  })

  it('renders immediately and leaves identity unchanged while the account request hangs', () => {
    const request = vi.fn(() => new Promise<Response>(() => undefined))
    vi.stubGlobal('fetch', request)
    const analytics: AnalyticsClient = {capture: vi.fn(), identify: vi.fn(), page: vi.fn(), reset: vi.fn()}
    render(<AnalyticsProvider analytics={analytics} locale="en"><div>Visible immediately</div></AnalyticsProvider>)
    expect(screen.getByText('Visible immediately')).toBeVisible()
    expect(request).toHaveBeenCalledWith('/api/account', expect.objectContaining({cache: 'no-store', credentials: 'include'}))
    expect(analytics.identify).not.toHaveBeenCalled()
    expect(analytics.reset).not.toHaveBeenCalled()
  })

  it('does not reset or flush queued events when account resolution is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 503})))
    const analytics: AnalyticsClient = {capture: vi.fn(), identify: vi.fn(), page: vi.fn(), reset: vi.fn()}
    render(<AnalyticsProvider analytics={analytics} locale="en"><div>Unavailable</div></AnalyticsProvider>)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(analytics.reset).not.toHaveBeenCalled()
    expect(analytics.identify).not.toHaveBeenCalled()
    expect(analytics.page).not.toHaveBeenCalled()
    expect(analytics.capture).not.toHaveBeenCalled()
  })

  it('preserves the persisted anonymous ID on initial load and unchanged focus refresh', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 204})))
    const analytics: AnalyticsClient = {capture: vi.fn(), identify: vi.fn(), page: vi.fn(), reset: vi.fn()}
    render(<AnalyticsProvider analytics={analytics} locale="en"><div>Anonymous</div></AnalyticsProvider>)
    await waitFor(() => expect(analytics.page).toHaveBeenCalledTimes(1))
    expect(analytics.reset).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(analytics.reset).not.toHaveBeenCalled()
  })
})
