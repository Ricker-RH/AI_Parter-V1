import {describe, expect, it} from 'vitest'
import {analyticsRelease} from './release.js'

describe('analytics release', () => {
  it('prefers the Vercel commit SHA over the server-only release', () => {
    expect(analyticsRelease({VERCEL_GIT_COMMIT_SHA: 'abc.123', AIFANS_RELEASE: 'private-release'})).toBe('abc.123')
  })

  it.each([
    [{AIFANS_RELEASE: 'release_1'}, 'release_1'],
    [{AIFANS_RELEASE: 'contains secret'}, 'local'],
    [{AIFANS_RELEASE: 'a'.repeat(65)}, 'local'],
    [{}, 'local'],
  ] as const)('normalizes only bounded ASCII release identifiers', (environment, expected) => {
    expect(analyticsRelease(environment)).toBe(expected)
  })
})
