import {describe, expect, it, vi} from 'vitest'
import {createAnalyticsEvent} from './contracts.js'
import {trackPerformanceMeasured} from './performance.js'

const properties = {
  locale: 'en' as const,
  route_name: '/[locale]' as const,
  metric: 'LCP' as const,
  metric_id: 'v3-123_abc',
  value: 1234.5,
  rating: 'good' as const,
  device_type: 'desktop' as const,
  release: '2026.09.01',
}

describe('performance analytics contract', () => {
  it('creates the closed performance_measured event with only approved properties', () => {
    expect(createAnalyticsEvent('performance_measured', properties)).toEqual({
      name: 'performance_measured',
      properties: {event_version: 1, ...properties},
    })
  })

  it.each([
    {metric: 'FCP'},
    {metric_id: 'https://aifans.example/en?token=private'},
    {metric_id: 'metric id'},
    {value: -1},
    {value: Number.NaN},
    {rating: 'unknown'},
    {device_type: 'Desktop'},
    {release: 'release/token=private'},
    {route_name: '/en?email=private@example.com'},
    {authorization: 'Bearer private'},
  ])('rejects unsafe or unapproved performance property %o', (invalid) => {
    expect(() => createAnalyticsEvent('performance_measured', {...properties, ...invalid} as never)).toThrow()
  })

  it('does not let a performance transport failure affect the browser', () => {
    const capture = vi.fn(() => { throw new Error('unavailable') })
    expect(() => trackPerformanceMeasured({capture, identify: vi.fn(), page: vi.fn(), reset: vi.fn()}, properties)).not.toThrow()
  })
})
