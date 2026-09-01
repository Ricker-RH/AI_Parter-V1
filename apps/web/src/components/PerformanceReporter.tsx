'use client'

import {useCallback, useRef} from 'react'
import {usePathname} from 'next/navigation'
import {useReportWebVitals} from 'next/web-vitals'
import type {Locale} from '../i18n/config'
import {type AnalyticsPerformanceMetric} from '../lib/analytics/contracts'
import {deviceType, trackPerformanceMeasured} from '../lib/analytics/performance'
import {routeNameForPath, useAnalytics} from '../lib/analytics/provider'

type WebVital = Parameters<typeof useReportWebVitals>[0] extends (metric: infer Metric) => void ? Metric : never

function performanceMetric(name: string): AnalyticsPerformanceMetric | null {
  return name === 'INP' || name === 'LCP' || name === 'CLS' ? name : null
}

export function PerformanceReporter({locale}: {locale: Locale}) {
  const analytics = useAnalytics()
  const pathname = usePathname()
  const current = useRef({analytics, locale, pathname})
  current.current = {analytics, locale, pathname}
  const report = useCallback((metric: WebVital) => {
    try {
      const state = current.current
      const route_name = routeNameForPath(state.pathname)
      const name = performanceMetric(metric.name)
      if (!route_name || !name || !Number.isFinite(metric.value) || metric.value < 0 || !metric.id) return
      trackPerformanceMeasured(state.analytics, {
        locale: state.locale,
        route_name,
        metric: name,
        metric_id: metric.id,
        value: metric.value,
        rating: metric.rating,
        device_type: deviceType(navigator.userAgent),
        release: process.env.NEXT_PUBLIC_RELEASE ?? 'unknown',
      })
    } catch {
      // Browser navigation and rendering must never depend on analytics.
    }
  }, [])
  useReportWebVitals(report)
  return null
}
