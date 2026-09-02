'use client'

import {useCallback, useEffect, useInsertionEffect, useRef, useState} from 'react'
import {flushSync} from 'react-dom'
import {usePathname, useSearchParams} from 'next/navigation'
import type {Locale} from '../i18n/config'
import {routeNameForPath, useAnalytics} from '../lib/analytics/provider'
import {deviceType, performanceBudget, trackPerformanceMeasured} from '../lib/analytics/performance'
import type {AnalyticsPerformanceMetric, AnalyticsPerformanceRating} from '../lib/analytics/contracts'

type PendingNavigation = {generation: number; readyGeneration: number; readyObservedBeforeStart: boolean; reportedMetrics: Set<string>; startedAt: number; targetPathname: string; targetRoute: string}
type RouteReady = {generation: number; route: string}

function rating(metric: AnalyticsPerformanceMetric, value: number): AnalyticsPerformanceRating {
  const budget = performanceBudget(metric)
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
  const latestReadyRoute = useRef<string | null>(null)
  const lastRoute = useRef(currentRoute)
  const [pending, setPending] = useState<PendingNavigation | null>(null)

  const measure = useCallback((metric: AnalyticsPerformanceMetric, active: PendingNavigation) => {
    const routeName = routeNameForPath(active.targetPathname)
    if (!routeName) return
    const measurementKey = `${active.generation}-${metric}`
    if (active.reportedMetrics.has(measurementKey)) return
    active.reportedMetrics.add(measurementKey)
    const value = Math.max(0, performance.now() - active.startedAt)
    trackPerformanceMeasured(analytics, {
      locale,
      route_name: routeName,
      metric,
      metric_id: `navigation-${active.generation}-${metric}`,
      value,
      rating: rating(metric, value),
      device_type: deviceType(navigator.userAgent, navigator.maxTouchPoints),
      release,
    })
  }, [analytics, locale, release])

  useInsertionEffect(() => {
    function onRouteReady(event: Event) {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail as Partial<RouteReady> | null
      if (!detail || typeof detail.generation !== 'number' || typeof detail.route !== 'string') return
      if (detail.generation <= latestReadyGeneration.current) return
      latestReadyGeneration.current = detail.generation
      latestReadyRoute.current = detail.route
    }
    document.addEventListener('aifans:route-ready', onRouteReady)
    return () => document.removeEventListener('aifans:route-ready', onRouteReady)
  }, [])

  useEffect(() => {
    function start(target: EventTarget | null) {
      const destination = destinationFrom(target)
      if (!destination) return
      const active = {generation: ++sequence.current, readyGeneration: latestReadyGeneration.current, readyObservedBeforeStart: false, reportedMetrics: new Set<string>(), startedAt: performance.now(), ...destination}
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
    let shellReported = false
    const reportShell = () => {
      if (shellReported || !document.querySelector('.route-skeleton')) return
      shellReported = true
      measure('shell', pending)
    }
    const targetReadyMain = () => {
      const main = document.querySelector<HTMLElement>('main:not(.route-skeleton)')
      if (!main || document.querySelector('.route-skeleton')) return null
      if (latestReadyRoute.current !== pending.targetRoute || latestReadyGeneration.current < pending.readyGeneration || (latestReadyGeneration.current === pending.readyGeneration && !pending.readyObservedBeforeStart)) return null
      return main
    }
    const reportReady = () => {
      if (currentRoute !== pending.targetRoute || !targetReadyMain()) return
      measure('navigation', pending)
      setPending(null)
    }
    reportShell()
    const observer = new MutationObserver(() => {
      reportShell()
      reportReady()
    })
    observer.observe(document.body, {childList: true, subtree: true})
    const timeout = window.setTimeout(() => setPending((current) => current?.generation === pending.generation ? null : current), 1500)
    const frame = requestAnimationFrame(reportReady)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
      observer.disconnect()
    }
  }, [currentRoute, measure, pending])

  useEffect(() => {
    if (currentRoute === lastRoute.current) return
    lastRoute.current = currentRoute
    if (pending?.targetRoute === currentRoute) return
    const destination = new URL(currentRoute, window.location.origin)
    const active = {generation: ++sequence.current, readyGeneration: latestReadyGeneration.current, readyObservedBeforeStart: latestReadyRoute.current === currentRoute, reportedMetrics: new Set<string>(), startedAt: performance.now(), targetPathname: destination.pathname, targetRoute: currentRoute}
    setPending(active)
  }, [currentRoute, pending])

  return pending ? <div aria-atomic="true" aria-live="polite" className="navigation-feedback" data-navigation-pending="true" role="status"><span className="navigation-feedback__indicator" aria-hidden="true"/><span className="sr-only">{pendingLabel(locale)}</span></div> : null
}
