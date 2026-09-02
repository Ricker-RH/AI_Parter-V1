import {describe, expect, it} from 'vitest'
import {formatRelativeDuration} from './relative-time.js'

const now = Date.parse('2026-09-02T12:00:00.000Z')

describe('formatRelativeDuration', () => {
  it.each([
    ['2026-09-02T11:59:45.000Z', 'en', 'now'],
    ['2026-09-02T11:55:00.000Z', 'en', '5m'],
    ['2026-09-02T07:00:00.000Z', 'en', '5h'],
    ['2026-08-29T12:00:00.000Z', 'en', '4d'],
    ['2026-08-12T12:00:00.000Z', 'en', '3w'],
    ['2026-07-02T12:00:00.000Z', 'en', '2mo'],
    ['2025-09-02T12:00:00.000Z', 'en', '1y'],
    ['2026-09-02T11:55:00.000Z', 'zh-CN', '5分钟'],
    ['2026-09-02T07:00:00.000Z', 'zh-CN', '5小时'],
    ['2026-08-29T12:00:00.000Z', 'zh-CN', '4天'],
  ] as const)('formats %s as a compact elapsed duration in %s', (publishedAt, locale, expected) => {
    expect(formatRelativeDuration(publishedAt, locale, now)).toBe(expected)
  })

  it.each(['not-a-date', '2026-09-03T12:00:00.000Z'])('falls back safely for invalid or future values: %s', (publishedAt) => {
    expect(formatRelativeDuration(publishedAt, 'en', now)).toBe('now')
    expect(formatRelativeDuration(publishedAt, 'zh-CN', now)).toBe('刚刚')
  })
})
