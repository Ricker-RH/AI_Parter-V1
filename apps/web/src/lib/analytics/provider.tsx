'use client'

import {createContext, useContext, useEffect, useState} from 'react'
import {usePathname} from 'next/navigation'
import type {Locale} from '../../i18n/config'
import {createAnalyticsPage, isProfileUuid, noOpAnalytics, type AnalyticsClient, type AnalyticsEvent, type AnalyticsPage, type AnalyticsRouteName} from './contracts'
import {trackLandingViewed} from './events'

export interface PostHogSdk {
  init(key: string, options: {api_host: string; autocapture: false; capture_pageleave: false; capture_pageview: false}): void
  capture(name: string, properties: Record<string, unknown>): void
  identify(profileId: string): void
  reset(): void
}
type PostHogLoader = () => Promise<PostHogSdk>
type AdapterOptions = {key?: string | undefined; host?: string | undefined; load?: PostHogLoader | undefined}

async function loadPostHog(): Promise<PostHogSdk> { const {default: posthog} = await import('posthog-js'); return posthog }

export function createPostHogAnalytics({key, host = 'https://us.i.posthog.com', load = loadPostHog}: AdapterOptions): AnalyticsClient {
  let sdk: Promise<PostHogSdk | null> | undefined
  async function getSdk() {
    if (!key || typeof window === 'undefined') return null
    sdk ??= load().then((client) => { client.init(key, {api_host: host, autocapture: false, capture_pageleave: false, capture_pageview: false}); return client })
    try { return await sdk } catch { return null }
  }
  async function run(action: (client: PostHogSdk) => void) { try { const client = await getSdk(); if (client) action(client) } catch { /* Analytics is isolated from product behavior. */ } }
  return {
    capture: (event: AnalyticsEvent) => run((client) => client.capture(event.name, event.properties)),
    identify: (profileId) => isProfileUuid(profileId) ? run((client) => client.identify(profileId)) : Promise.resolve(),
    reset: () => run((client) => client.reset()),
    page: (page) => run((client) => client.capture('$pageview', createAnalyticsPage(page))),
  }
}

export function createBrowserAnalytics(): AnalyticsClient { return createPostHogAnalytics({key: process.env.NEXT_PUBLIC_POSTHOG_KEY, host: process.env.NEXT_PUBLIC_POSTHOG_HOST}) }

const knownRoutes: Record<string, AnalyticsRouteName> = {'': '/[locale]', admin: '/[locale]/admin', bookmarks: '/[locale]/bookmarks', messages: '/[locale]/messages', notifications: '/[locale]/notifications', profile: '/[locale]/profile', search: '/[locale]/search', settings: '/[locale]/settings', creator: '/[locale]/creator'}

export function routeNameForPath(pathname: string): AnalyticsRouteName | null {
  if (!pathname.startsWith('/') || pathname.includes('?') || pathname.includes('#')) return null
  const [, locale, first, second, third] = pathname.split('/')
  if (locale !== 'en' && locale !== 'zh-CN') return null
  if (first === 'posts' && second && !third) return '/[locale]/posts/[postId]'
  if (first === 'profiles' && second && !third) return '/[locale]/profiles/[profileId]'
  return second === undefined ? knownRoutes[first ?? ''] ?? null : null
}

function safely(analytics: AnalyticsClient): AnalyticsClient {
  function run(operation: () => void | Promise<void>) { try { void Promise.resolve(operation()).catch(() => undefined) } catch { /* Future providers are isolated too. */ } }
  return {capture: (event) => run(() => analytics.capture(event)), identify: (profileId) => run(() => analytics.identify(profileId)), reset: () => run(() => analytics.reset()), page: (page) => run(() => analytics.page(page))}
}

const AnalyticsContext = createContext<AnalyticsClient>(noOpAnalytics)

export function AnalyticsProvider({analytics, children, locale, profileId}: {analytics?: AnalyticsClient; children: React.ReactNode; locale: Locale; profileId?: string | null}) {
  const pathname = usePathname()
  const [client] = useState(() => safely(analytics ?? createBrowserAnalytics()))
  const routeName = routeNameForPath(pathname)
  useEffect(() => {
    if (!routeName) return
    client.page(createAnalyticsPage({locale, route_name: routeName}))
    if (routeName === '/[locale]') trackLandingViewed(client, {locale, routeName})
  }, [client, locale, routeName])
  useEffect(() => {
    if (profileId && isProfileUuid(profileId)) client.identify(profileId)
    else client.reset()
  }, [client, profileId])
  return <AnalyticsContext.Provider value={client}>{children}</AnalyticsContext.Provider>
}

export function useAnalytics() { return useContext(AnalyticsContext) }
