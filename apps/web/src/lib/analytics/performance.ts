import type {Locale} from '../../i18n/config'
import type {AnalyticsClient, AnalyticsDeviceType, AnalyticsPerformanceMetric, AnalyticsPerformanceRating, AnalyticsRouteName} from './contracts'
import {trackPerformanceMeasured as capturePerformanceMeasured} from './events'

export type PerformanceMeasurement = {locale: Locale; route_name: AnalyticsRouteName; metric: AnalyticsPerformanceMetric; metric_id: string; value: number; rating: AnalyticsPerformanceRating; device_type: AnalyticsDeviceType; release: string}

export function trackPerformanceMeasured(analytics: AnalyticsClient, properties: PerformanceMeasurement) {
  capturePerformanceMeasured(analytics, properties)
}

export function deviceType(userAgent: string, maxTouchPoints = 0): AnalyticsDeviceType {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'tablet'
  return /Mobi|Android|iPhone|iPod/i.test(userAgent) ? 'mobile' : 'desktop'
}
