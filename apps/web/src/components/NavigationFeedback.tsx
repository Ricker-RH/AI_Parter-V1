'use client'

import {useCallback, useEffect, useRef, useState} from 'react'
import {flushSync} from 'react-dom'
import {usePathname} from 'next/navigation'
import type {Locale} from '../i18n/config'
import {routeNameForPath, useAnalytics} from '../lib/analytics/provider'
import {deviceType, trackPerformanceMeasured} from '../lib/analytics/performance'
import type {AnalyticsPerformanceMetric, AnalyticsPerformanceRating} from '../lib/analytics/contracts'

type PendingNavigation = {id: number; startedAt: number; targetPathname: string}

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
  if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return null
  return destination.pathname
}

export function NavigationFeedback({locale, release}: {locale: Locale; release: string}) {
  const analytics = useAnalytics()
  const pathname = usePathname()
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
      const targetPathname = destinationFrom(target)
      if (!targetPathname) return
      const active = {id: ++sequence.current, startedAt: performance.now(), targetPathname}
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
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
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
    const frame = requestAnimationFrame(() => {
      if (pathname !== pending.targetPathname || !document.querySelector('main')) return
      measure('navigation', pending)
      setPending(null)
    })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [measure, pathname, pending])

  return pending ? <div aria-atomic="true" aria-live="polite" className="navigation-feedback" data-navigation-pending="true" role="status"><span className="navigation-feedback__indicator" aria-hidden="true"/><span className="sr-only">{pendingLabel(locale)}</span></div> : null
}
