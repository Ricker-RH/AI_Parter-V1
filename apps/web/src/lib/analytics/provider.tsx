'use client'

import {createContext, useContext, useEffect, useState} from 'react'
import {usePathname} from 'next/navigation'
import type {Locale} from '../../i18n/config'
import {
  ANALYTICS_EVENT_NAMES,
  createAnalyticsEvent,
  createAnalyticsPage,
  isProfileUuid,
  noOpAnalytics,
  type AnalyticsClient,
  type AnalyticsEvent,
  type AnalyticsRouteName,
} from './contracts'
import {trackLandingViewed} from './events'

type PostHogCaptureResult = {
  uuid: string
  event: string
  properties: Record<string, unknown>
  $set?: Record<string, unknown>
  $set_once?: Record<string, unknown>
  timestamp?: Date
}

type PostHogInitOptions = {
  advanced_disable_flags: true
  advanced_disable_toolbar_metrics: true
  api_host: string
  autocapture: false
  before_send: (event: PostHogCaptureResult | null) => PostHogCaptureResult | null
  capture_dead_clicks: false
  capture_exceptions: false
  capture_pageleave: false
  capture_pageview: false
  capture_performance: false
  disable_external_dependency_loading: true
  disable_conversations: true
  disable_product_tours: true
  disable_session_recording: true
  disable_surveys: true
  disable_surveys_automatic_display: true
  disable_web_experiments: true
  mask_all_element_attributes: true
  mask_all_text: true
  property_denylist: string[]
  save_campaign_params: false
  save_referrer: false
}

export interface PostHogSdk {
  init(key: string, options: PostHogInitOptions): void
  capture(name: string, properties: Record<string, unknown>): void
  identify(profileId: string): void
  reset(): void
}

export const POSTHOG_PROPERTY_DENYLIST = [
  '$current_url', '$referrer', '$referring_domain', '$pathname', '$host', '$initial_current_url', '$initial_referrer', '$initial_referring_domain',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gad_source', 'fbclid', 'msclkid', 'dclid',
  'email', 'cookie', 'authorization', 'access_token', 'password',
] as const

export function createPostHogInitOptions(host: string): PostHogInitOptions {
  return {
    advanced_disable_flags: true,
    advanced_disable_toolbar_metrics: true,
    api_host: host,
    autocapture: false,
    before_send: sanitizePostHogEvent,
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_pageleave: false,
    capture_pageview: false,
    capture_performance: false,
    disable_conversations: true,
    disable_external_dependency_loading: true,
    disable_product_tours: true,
    disable_session_recording: true,
    disable_surveys: true,
    disable_surveys_automatic_display: true,
    disable_web_experiments: true,
    mask_all_element_attributes: true,
    mask_all_text: true,
    property_denylist: [...POSTHOG_PROPERTY_DENYLIST],
    save_campaign_params: false,
    save_referrer: false,
  }
}

const productPropertyKeys = [
  'event_version', 'locale', 'route_name', 'action_source', 'feed', 'category', 'query_length', 'ip_profile_id', 'post_id', 'creation_step', 'visual_type', 'metric', 'metric_id', 'value', 'rating', 'device_type', 'release',
] as const
const safeId = /^[a-zA-Z0-9_-]{1,128}$/
const safeDeviceTypes = new Set(['Desktop', 'Mobile', 'Tablet'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeVendorProperties(properties: Record<string, unknown>) {
  const safe: Record<string, unknown> = {}
  if (typeof properties.token === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(properties.token)) safe.token = properties.token
  for (const key of ['distinct_id', '$anon_distinct_id', '$session_id', '$window_id', '$insert_id'] as const) {
    if (typeof properties[key] === 'string' && safeId.test(properties[key])) safe[key] = properties[key]
  }
  if (typeof properties.$device_type === 'string' && safeDeviceTypes.has(properties.$device_type)) safe.$device_type = properties.$device_type
  if (typeof properties.$time === 'number' && Number.isFinite(properties.$time)) safe.$time = properties.$time
  return safe
}

function productProperties(properties: Record<string, unknown>) {
  const product: Record<string, unknown> = {}
  for (const key of productPropertyKeys) if (key in properties) product[key] = properties[key]
  return product
}

export function sanitizePostHogEvent(input: PostHogCaptureResult | null): PostHogCaptureResult | null {
  if (!input || !isRecord(input.properties)) return null
  const vendor = safeVendorProperties(input.properties)
  let validated: Record<string, unknown>
  try {
    if ((ANALYTICS_EVENT_NAMES as readonly string[]).includes(input.event)) {
      const product = productProperties(input.properties)
      if (product.event_version !== 1) return null
      delete product.event_version
      validated = createAnalyticsEvent(input.event as never, product as never).properties
    } else if (input.event === '$pageview') {
      if (input.properties.event_version !== 1) return null
      validated = createAnalyticsPage({locale: input.properties.locale, route_name: input.properties.route_name} as never)
    } else if (input.event === '$identify') {
      if (typeof vendor.distinct_id !== 'string' || !isProfileUuid(vendor.distinct_id)) return null
      validated = {}
    } else {
      return null
    }
  } catch {
    return null
  }
  return {
    uuid: input.uuid,
    event: input.event,
    properties: {...vendor, ...validated},
    ...(input.timestamp instanceof Date ? {timestamp: input.timestamp} : {}),
  }
}

type PostHogLoader = () => Promise<PostHogSdk>
type AdapterOptions = {key?: string | undefined; host?: string | undefined; load?: PostHogLoader | undefined}

async function loadPostHog(): Promise<PostHogSdk> {
  const {default: posthog} = await import('posthog-js')
  return posthog
}

export function createPostHogAnalytics({key, host = 'https://us.i.posthog.com', load = loadPostHog}: AdapterOptions): AnalyticsClient {
  let sdk: Promise<PostHogSdk | null> | undefined
  async function getSdk() {
    if (!key || typeof window === 'undefined') return null
    sdk ??= load().then((client) => {
      client.init(key, createPostHogInitOptions(host))
      return client
    })
    try { return await sdk } catch { return null }
  }
  async function run(action: (client: PostHogSdk) => void) {
    try { const client = await getSdk(); if (client) action(client) } catch { /* Analytics is isolated from product behavior. */ }
  }
  return {
    capture: (event: AnalyticsEvent) => run((client) => client.capture(event.name, event.properties)),
    identify: (profileId) => isProfileUuid(profileId) ? run((client) => client.identify(profileId)) : Promise.resolve(),
    reset: () => run((client) => client.reset()),
    page: (page) => run((client) => client.capture('$pageview', createAnalyticsPage(page))),
  }
}

export function createBrowserAnalytics(): AnalyticsClient {
  return createPostHogAnalytics({key: process.env.NEXT_PUBLIC_POSTHOG_KEY, host: process.env.NEXT_PUBLIC_POSTHOG_HOST})
}

const knownRoutes: Record<string, AnalyticsRouteName> = {'': '/[locale]', activity: '/[locale]/activity', admin: '/[locale]/admin', bookmarks: '/[locale]/bookmarks', liked: '/[locale]/liked', messages: '/[locale]/messages', notifications: '/[locale]/notifications', profile: '/[locale]/profile', search: '/[locale]/search', settings: '/[locale]/settings', creator: '/[locale]/creator'}

export function routeNameForPath(pathname: string): AnalyticsRouteName | null {
  if (!pathname.startsWith('/') || pathname.includes('?') || pathname.includes('#')) return null
  const [, locale, first, second, third] = pathname.split('/')
  if (locale !== 'en' && locale !== 'zh-CN') return null
  if (first === 'posts' && second && !third) return '/[locale]/posts/[postId]'
  if (first === 'profiles' && second && !third) return '/[locale]/profiles/[profileId]'
  return second === undefined ? knownRoutes[first ?? ''] ?? null : null
}

function safely(analytics: AnalyticsClient): AnalyticsClient {
  async function run(operation: () => void | Promise<void>) { try { await operation() } catch { /* Future providers are isolated too. */ } }
  return {capture: (event) => run(() => analytics.capture(event)), identify: (profileId) => run(() => analytics.identify(profileId)), reset: () => run(() => analytics.reset()), page: (page) => run(() => analytics.page(page))}
}

type AccountIdentity = {status: 'authenticated'; profileId: string} | {status: 'anonymous'} | {status: 'unavailable'}

async function loadAnalyticsIdentity(signal: AbortSignal): Promise<AccountIdentity> {
  try {
    const response = await fetch('/api/account', {cache: 'no-store', credentials: 'include', signal})
    if (response.status === 204) return {status: 'anonymous'}
    if (!response.ok) return {status: 'unavailable'}
    const body: unknown = await response.json()
    if (!isRecord(body) || Object.keys(body).length !== 1 || typeof body.profileId !== 'string' || !isProfileUuid(body.profileId)) return {status: 'unavailable'}
    return {status: 'authenticated', profileId: body.profileId}
  } catch {
    return {status: 'unavailable'}
  }
}

type StableIdentity = {status: 'authenticated'; profileId: string} | {status: 'anonymous'}

function createIdentityGate(analytics: AnalyticsClient) {
  let stable: StableIdentity | undefined
  let resolving = true
  const queue: Array<() => void | Promise<void>> = []
  async function flush() {
    while (queue.length) await queue.shift()?.()
  }
  const client: AnalyticsClient = {
    capture: (event) => resolving ? void queue.push(() => analytics.capture(event)) : analytics.capture(event),
    page: (page) => resolving ? void queue.push(() => analytics.page(page)) : analytics.page(page),
    identify: (profileId) => analytics.identify(profileId),
    reset: () => analytics.reset(),
  }
  return {
    client,
    beginResolution() { resolving = true },
    async authenticated(profileId: string) {
      if (stable?.status !== 'authenticated' || stable.profileId !== profileId) await analytics.identify(profileId)
      stable = {status: 'authenticated', profileId}
      resolving = false
      await flush()
    },
    async anonymous() {
      if (stable?.status === 'authenticated') await analytics.reset()
      stable = {status: 'anonymous'}
      resolving = false
      await flush()
    },
    async unavailable() {
      if (!stable) return
      resolving = false
      await flush()
    },
  }
}

const AnalyticsContext = createContext<AnalyticsClient>(noOpAnalytics)

export function AnalyticsProvider({analytics, children, locale}: {analytics?: AnalyticsClient; children: React.ReactNode; locale: Locale}) {
  const pathname = usePathname()
  const [gate] = useState(() => createIdentityGate(safely(analytics ?? createBrowserAnalytics())))
  const client = gate.client
  const routeName = routeNameForPath(pathname)
  useEffect(() => {
    if (!routeName) return
    client.page(createAnalyticsPage({locale, route_name: routeName}))
    if (routeName === '/[locale]') trackLandingViewed(client, {locale, routeName})
  }, [client, locale, routeName])
  useEffect(() => {
    let controller: AbortController | undefined
    let sequence = 0
    function refresh() {
      const refreshSequence = ++sequence
      controller?.abort()
      controller = new AbortController()
      gate.beginResolution()
      void loadAnalyticsIdentity(controller.signal).then(async (identity) => {
        if (refreshSequence !== sequence || controller?.signal.aborted) return
        if (identity.status === 'authenticated') await gate.authenticated(identity.profileId)
        else if (identity.status === 'anonymous') await gate.anonymous()
        else await gate.unavailable()
      })
    }
    function refreshWhenVisible() { if (document.visibilityState === 'visible') refresh() }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      sequence++
      controller?.abort()
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [gate])
  return <AnalyticsContext.Provider value={client}>{children}</AnalyticsContext.Provider>
}

export function useAnalytics() { return useContext(AnalyticsContext) }
