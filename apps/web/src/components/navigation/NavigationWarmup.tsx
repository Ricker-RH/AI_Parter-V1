'use client'

import {useQueryClient} from '@tanstack/react-query'
import {usePathname, useSearchParams} from 'next/navigation'
import {useEffect, useMemo} from 'react'
import type {Locale} from '../../i18n/config'
import {useCurrentAccount} from '../account/CurrentAccountProvider'
import {aiInboxQueryOptions} from '../chat/ai-inbox-query'
import {humanInboxQueryOptions} from '../chat/human-inbox-query'
import {myProfileQueryOptions} from '../profile/my-profile-query'
import {homeFeedQueryOptions} from '../social/home-feed-query'
import {createNavigationWarmupScheduler, type NavigationWarmupTask} from './navigation-warmup'

function scheduleWhenIdle(work: () => void) {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(work)
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(work, 100)
  return () => window.clearTimeout(id)
}

function shouldConserveData() {
  const connection = (navigator as Navigator & {connection?: {saveData?: boolean; effectiveType?: string}}).connection
  return connection?.saveData === true || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g'
}

function routeHasReportedReady(route: string) {
  return [...document.querySelectorAll<HTMLElement>('[data-route-ready]')].some(node => node.dataset.routeReady === route)
}

export function NavigationWarmup({locale}: {locale: Locale}) {
  const client = useQueryClient()
  const {account, status} = useCurrentAccount()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const route = useMemo(() => `${pathname}${searchParams.size ? `?${searchParams}` : ''}`, [pathname, searchParams])

  useEffect(() => {
    const scheduler = createNavigationWarmupScheduler({
      isVisible: () => document.visibilityState === 'visible',
      isOnline: () => navigator.onLine !== false,
      shouldConserveData,
      isForegroundIdle: () => client.isFetching() === 0,
      scheduleIdle: scheduleWhenIdle,
    })
    const homeRoute = `/${locale}`
    const messagesRoute = `/${locale}/messages`
    const profileRoute = `/${locale}/profile`
    const scope = account ? `${account.kind}:${account.id}` : 'public'
    const tasks: NavigationWarmupTask[] = []

    const restrictedRoute = pathname.startsWith(`/${locale}/auth`) || pathname.startsWith(`/${locale}/admin`)
    if (!restrictedRoute && pathname !== homeRoute)
      tasks.push(async () => { await client.prefetchQuery(homeFeedQueryOptions(scope, locale, 'for_you')) })
    if (!restrictedRoute && status === 'authenticated' && account && pathname !== messagesRoute)
      tasks.push(async () => { await client.prefetchQuery(aiInboxQueryOptions(scope, locale)) })
    if (!restrictedRoute && status === 'authenticated' && account?.kind === 'human' && pathname !== messagesRoute)
      tasks.push(async () => { await client.prefetchQuery(humanInboxQueryOptions(account.id)) })
    if (!restrictedRoute && status === 'authenticated' && account && pathname !== profileRoute)
      tasks.push(async () => { await client.prefetchQuery(myProfileQueryOptions(scope, locale, 'ips')) })

    const begin = () => scheduler.start(tasks)
    let loaded = document.readyState === 'complete'
    let ready = routeHasReportedReady(route)
    const beginWhenReady = () => {
      if (loaded && ready) begin()
    }
    const onRouteReady = (event: Event) => {
      if ((event as CustomEvent<{route?: string}>).detail?.route === route) {
        ready = true
        beginWhenReady()
      }
    }
    const onLoad = () => {
      loaded = true
      ready ||= routeHasReportedReady(route)
      beginWhenReady()
    }
    document.addEventListener('aifans:route-ready', onRouteReady)
    if (loaded) onLoad()
    else window.addEventListener('load', onLoad, {once: true})

    return () => {
      scheduler.cancel()
      document.removeEventListener('aifans:route-ready', onRouteReady)
      window.removeEventListener('load', onLoad)
    }
  }, [account?.id, account?.kind, client, locale, pathname, route, status])

  return null
}
