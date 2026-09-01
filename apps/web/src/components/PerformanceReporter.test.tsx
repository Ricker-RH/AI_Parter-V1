import {render, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {AnalyticsProvider} from '../lib/analytics/provider.js'
import {PerformanceReporter} from './PerformanceReporter.js'

let pathname = '/en'
let callback: ((metric: {name: string; id: string; value: number; rating: 'good' | 'needs-improvement' | 'poor'}) => void) | undefined
vi.mock('next/navigation', () => ({usePathname: () => pathname}))
vi.mock('next/web-vitals', () => ({useReportWebVitals: (report: typeof callback) => { callback = report }}))

afterEach(() => { pathname = '/en'; callback = undefined; vi.unstubAllGlobals() })

describe('PerformanceReporter', () => {
  it('keeps late vitals on the initial locale and route, with raw CLS values', async () => {
    const analytics = {capture: vi.fn(), identify: vi.fn(), page: vi.fn(), reset: vi.fn()}
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 204})))
    const view = render(<AnalyticsProvider analytics={analytics} locale="en"><PerformanceReporter locale="en" release="build_1" /></AnalyticsProvider>)
    expect(callback).toBeTypeOf('function')
    pathname = '/zh-CN/search'
    view.rerender(<AnalyticsProvider analytics={analytics} locale="zh-CN"><PerformanceReporter locale="zh-CN" release="build_2" /></AnalyticsProvider>)
    expect(() => callback?.({name: 'CLS', id: 'cls_1', value: 0.125, rating: 'good'})).not.toThrow()
    await waitFor(() => expect(analytics.capture).toHaveBeenCalledWith(expect.objectContaining({name: 'performance_measured', properties: expect.objectContaining({locale: 'en', route_name: '/[locale]', value: 0.125, release: 'build_1'})})))
  })

  it.each(['FCP', 'TTFB'])('drops non-core web vital %s', (name) => {
    const analytics = {capture: vi.fn(), identify: vi.fn(), page: vi.fn(), reset: vi.fn()}
    render(<AnalyticsProvider analytics={analytics} locale="en"><PerformanceReporter locale="en" release="build_1" /></AnalyticsProvider>)
    callback?.({name, id: 'metric_1', value: 1, rating: 'good'})
    expect(analytics.capture).not.toHaveBeenCalledWith(expect.objectContaining({name: 'performance_measured'}))
  })

  it('isolates asynchronous analytics capture failures', () => {
    const analytics = {capture: vi.fn().mockRejectedValue(new Error('unavailable')), identify: vi.fn(), page: vi.fn(), reset: vi.fn()}
    render(<AnalyticsProvider analytics={analytics} locale="en"><PerformanceReporter locale="en" release="build_1" /></AnalyticsProvider>)
    expect(() => callback?.({name: 'INP', id: 'inp_1', value: 12, rating: 'good'})).not.toThrow()
  })
})
