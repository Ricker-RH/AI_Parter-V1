'use client'

import {createContext, useContext, useEffect, useState} from 'react'
import {usePathname} from 'next/navigation'
import type {Locale} from '../../i18n/config'
import {isProfileUuid, noOpAnalytics, type AnalyticsClient, type AnalyticsEvent, type AnalyticsPage} from './contracts'

export interface PostHogSdk {
  init(key: string, options: {api_host: string; autocapture: false; capture_pageleave: false; capture_pageview: false}): void
  capture(name: string, properties: Record<string, unknown>): void
  identify(profileId: string): void
  reset(): void
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
      client.init(key, {api_host: host, autocapture: false, capture_pageleave: false, capture_pageview: false})
      return client
    })
    try {
      return await sdk
    } catch {
      return null
    }
  }
  async function run(action: (client: PostHogSdk) => void) {
    try {
      const client = await getSdk()
      if (client) action(client)
    } catch {
      // Browser analytics failures are intentionally isolated from product behavior.
    }
  }
  return {
    capture: (event: AnalyticsEvent) => run((client) => client.capture(event.name, event.properties)),
    identify: (profileId) => isProfileUuid(profileId) ? run((client) => client.identify(profileId)) : Promise.resolve(),
    reset: () => run((client) => client.reset()),
    page: (page: AnalyticsPage) => run((client) => client.capture('$pageview', page)),
  }
}

export function createBrowserAnalytics(): AnalyticsClient {
  return createPostHogAnalytics({
    key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  })
}

const knownRoutes: Record<string, string> = {
  '': '/[locale]',
  admin: '/[locale]/admin',
  bookmarks: '/[locale]/bookmarks',
  messages: '/[locale]/messages',
  notifications: '/[locale]/notifications',
  profile: '/[locale]/profile',
  search: '/[locale]/search',
  settings: '/[locale]/settings',
}

export function routeNameForPath(pathname: string) {
  const [, , first, second] = pathname.split('/')
  if (first === 'posts' && second) return '/[locale]/posts/[postId]'
  if (first === 'profiles' && second) return '/[locale]/profiles/[profileId]'
  return knownRoutes[first ?? ''] ?? '/[locale]/unknown'
}

function safely(analytics: AnalyticsClient): AnalyticsClient {
  function run(operation: () => void | Promise<void>) {
    try {
      void Promise.resolve(operation()).catch(() => undefined)
    } catch {
      // The provider is also safe with a future analytics implementation.
    }
  }
  return {
    capture: (event) => run(() => analytics.capture(event)),
    identify: (profileId) => run(() => analytics.identify(profileId)),
    reset: () => run(() => analytics.reset()),
    page: (page) => run(() => analytics.page(page)),
  }
}

const AnalyticsContext = createContext<AnalyticsClient>(noOpAnalytics)

export function AnalyticsProvider({analytics, children, locale}: {analytics?: AnalyticsClient; children: React.ReactNode; locale: Locale}) {
  const pathname = usePathname()
  const [client] = useState(() => safely(analytics ?? createBrowserAnalytics()))
  const routeName = routeNameForPath(pathname)
  useEffect(() => {
    client.page({locale, route_name: routeName})
  }, [client, locale, routeName])
  return <AnalyticsContext.Provider value={client}>{children}</AnalyticsContext.Provider>
}

export function useAnalytics() {
  return useContext(AnalyticsContext)
}
