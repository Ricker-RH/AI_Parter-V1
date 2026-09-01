'use client'

import {useCallback, useEffect, useRef, useState} from 'react'
import {flushSync} from 'react-dom'
import {usePathname, useSearchParams} from 'next/navigation'
import type {Locale} from '../i18n/config'
import {routeNameForPath, useAnalytics} from '../lib/analytics/provider'
import {deviceType, trackPerformanceMeasured} from '../lib/analytics/performance'
import type {AnalyticsPerformanceMetric, AnalyticsPerformanceRating} from '../lib/analytics/contracts'

type PendingNavigation = {id: number; startedAt: number; targetPathname: string; targetRoute: string}

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
  const [pending, setPending] = useState<PendingNavigation | null>(null)

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
    function start(target: EventTarget | null) {
      const destination = destinationFrom(target)
      if (!destination) return
      const active = {id: ++sequence.current, startedAt: performance.now(), ...destination}
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
    reportSkeleton()
    const observer = new MutationObserver(reportSkeleton)
    observer.observe(document.body, {childList: true, subtree: true})
    const timeout = window.setTimeout(() => setPending((current) => current?.id === pending.id ? null : current), 1500)
    const frame = requestAnimationFrame(() => {
      if (currentRoute !== pending.targetRoute || !document.querySelector('main:not(.route-skeleton)')) return
      measure('navigation', pending)
      setPending(null)
    })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
      observer.disconnect()
    }
  }, [currentRoute, measure, pending])

  return pending ? <div aria-atomic="true" aria-live="polite" className="navigation-feedback" data-navigation-pending="true" role="status"><span className="navigation-feedback__indicator" aria-hidden="true"/><span className="sr-only">{pendingLabel(locale)}</span></div> : null
}
