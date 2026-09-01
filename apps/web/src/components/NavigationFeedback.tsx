'use client'

import {useCallback, useEffect, useRef, useState} from 'react'
import {flushSync} from 'react-dom'
import {usePathname, useSearchParams} from 'next/navigation'
import type {Locale} from '../i18n/config'
import {routeNameForPath, useAnalytics} from '../lib/analytics/provider'
import {deviceType, trackPerformanceMeasured} from '../lib/analytics/performance'
import type {AnalyticsPerformanceMetric, AnalyticsPerformanceRating} from '../lib/analytics/contracts'

type PendingNavigation = {id: number; readyGeneration: number; startedAt: number; targetPathname: string; targetRoute: string}
type RouteReady = {generation: number; route: string}

function rating(metric: AnalyticsPerformanceMetric, value: number): AnalyticsPerformanceRating {
  const budget = metric === 'interaction' ? 100 : metric === 'skeleton' ? 150 : 800
  return value <= budget ? 'good' : value <= budget * 2 ? 'needs-improvement' : 'poor'
}

function pendingLabel(locale: Locale) {
  return locale === 'zh-CN' ? '正在加载' : 'Loading'
}

function destinationFrom(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  const anchor = target.closest('a[href]')
  if (!(anchor instanceof HTMLAnchorElement) || anchor.target || anchor.hasAttribute('download')) return null
  const destination = new URL(anchor.href, window.location.href)
  const targetRoute = `${destination.pathname}${destination.search}`
  if (destination.origin !== window.location.origin || targetRoute === `${window.location.pathname}${window.location.search}`) return null
  return {targetPathname: destination.pathname, targetRoute}
}

export function NavigationFeedback({locale, release}: {locale: Locale; release: string}) {
  const analytics = useAnalytics()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentRoute = `${pathname}${searchParams.size ? `?${searchParams}` : ''}`
  const sequence = useRef(0)
  const latestReadyGeneration = useRef(0)
  const [pending, setPending] = useState<PendingNavigation | null>(null)
  const [routeReady, setRouteReady] = useState<RouteReady | null>(null)

  const measure = useCallback((metric: AnalyticsPerformanceMetric, active: PendingNavigation) => {
    const routeName = routeNameForPath(active.targetPathname)
    if (!routeName) return
    const value = Math.max(0, performance.now() - active.startedAt)
    trackPerformanceMeasured(analytics, {
      locale,
      route_name: routeName,
      metric,
      metric_id: `navigation-${active.id}-${metric}`,
      value,
      rating: rating(metric, value),
      device_type: deviceType(navigator.userAgent, navigator.maxTouchPoints),
      release,
    })
  }, [analytics, locale, release])

  useEffect(() => {
    function onRouteReady(event: Event) {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail as Partial<RouteReady> | null
      if (!detail || typeof detail.generation !== 'number' || typeof detail.route !== 'string') return
      latestReadyGeneration.current = Math.max(latestReadyGeneration.current, detail.generation)
      setRouteReady({generation: detail.generation, route: detail.route})
    }
    document.addEventListener('aifans:route-ready', onRouteReady)
    return () => document.removeEventListener('aifans:route-ready', onRouteReady)
  }, [])

  useEffect(() => {
    function start(target: EventTarget | null) {
      const destination = destinationFrom(target)
      if (!destination) return
      const active = {id: ++sequence.current, readyGeneration: latestReadyGeneration.current, startedAt: performance.now(), ...destination}
      flushSync(() => setPending(active))
      measure('interaction', active)
    }
    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      start(event.target)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) start(event.target)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    const onPointerCancel = () => setPending(null)
    document.addEventListener('pointercancel', onPointerCancel, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointercancel', onPointerCancel, true)
    }
  }, [measure])

  useEffect(() => {
    if (!pending) return
    let skeletonReported = false
    const reportSkeleton = () => {
      if (skeletonReported || !document.querySelector('.route-skeleton')) return
      skeletonReported = true
      measure('skeleton', pending)
    }
    const targetReadyMain = () => {
      const main = document.querySelector<HTMLElement>('main:not(.route-skeleton)')
      if (!main || document.querySelector('.route-skeleton')) return null
      if (!routeReady || routeReady.route !== pending.targetRoute || routeReady.generation <= pending.readyGeneration) return null
      main.setAttribute('data-route-ready', pending.targetRoute)
      return main.getAttribute('data-route-ready') === pending.targetRoute ? main : null
    }
    const reportReady = () => {
      if (currentRoute !== pending.targetRoute || !targetReadyMain()) return
      measure('navigation', pending)
      setPending(null)
    }
    reportSkeleton()
    const observer = new MutationObserver(() => {
      reportSkeleton()
      reportReady()
    })
    observer.observe(document.body, {childList: true, subtree: true})
    const timeout = window.setTimeout(() => setPending((current) => current?.id === pending.id ? null : current), 1500)
    const frame = requestAnimationFrame(reportReady)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
      observer.disconnect()
    }
  }, [currentRoute, measure, pending, routeReady])

  return pending ? <div aria-atomic="true" aria-live="polite" className="navigation-feedback" data-navigation-pending="true" role="status"><span className="navigation-feedback__indicator" aria-hidden="true"/><span className="sr-only">{pendingLabel(locale)}</span></div> : null
}
