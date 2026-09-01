import {describe, expect, it, vi} from 'vitest'
import {createAnalyticsEvent} from './contracts.js'
import {deviceType, trackPerformanceMeasured} from './performance.js'
import {sanitizePostHogEvent} from './provider.js'

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
    {value: Number.POSITIVE_INFINITY},
    {value: Number.NEGATIVE_INFINITY},
    {rating: 'unknown'},
    {device_type: 'Desktop'},
    {release: 'release/token=private'},
    {metric_id: ''},
    {metric_id: 'a'.repeat(129)},
    {release: ''},
    {release: 'a'.repeat(65)},
    {route_name: '/en?email=private@example.com'},
    {authorization: 'Bearer private'},
    {cookie: 'session=private'},
    {password: 'private'},
  ])('rejects unsafe or unapproved performance property %o', (invalid) => {
    expect(() => createAnalyticsEvent('performance_measured', {...properties, ...invalid} as never)).toThrow()
  })

  it.each(['locale', 'route_name', 'metric', 'metric_id', 'release', 'value', 'rating', 'device_type'] as const)('requires performance property %s', (property) => {
    const incomplete = {...properties} as Record<string, unknown>
    delete incomplete[property]
    expect(() => createAnalyticsEvent('performance_measured', incomplete as never)).toThrow()
  })

  it('does not let a performance transport failure affect the browser', () => {
    const capture = vi.fn(() => { throw new Error('unavailable') })
    expect(() => trackPerformanceMeasured({capture, identify: vi.fn(), page: vi.fn(), reset: vi.fn()}, properties)).not.toThrow()
  })

  it('strips enriched sensitive fields and rejects invalid performance payloads before PostHog sends', () => {
    expect(sanitizePostHogEvent({uuid: 'event', event: 'performance_measured', properties: {event_version: 1, ...properties, email: 'private@example.com', cookie: 'session=private', $current_url: 'https://private.example/?token=private'}})).toMatchObject({properties: {event_version: 1, ...properties}})
    expect(sanitizePostHogEvent({uuid: 'event', event: 'performance_measured', properties: {event_version: 1, ...properties, metric_id: 'https://private.example/?token=private'}})).toBeNull()
  })

  it('recognizes iPadOS desktop user agents by touch capability', () => {
    expect(deviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 5)).toBe('tablet')
  })
})
