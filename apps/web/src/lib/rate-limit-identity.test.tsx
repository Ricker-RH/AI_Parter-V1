import {describe, expect, it} from 'vitest'
import {createRateLimitIdentity, requireWebRateLimitIdentitySecret} from './rate-limit-identity.js'

describe('rate limit identity envelope', () => {
  it('signs only Vercel-trusted client addresses without exposing the address', () => {
    const headers = new Headers({'x-vercel-forwarded-for': '203.0.113.7, 10.0.0.1'})
    const value = createRateLimitIdentity(headers, 1_788_200_000_000, 's'.repeat(32))

    expect(value).toMatch(/^v1\.\d+\.[a-f0-9]{64}\.[a-f0-9]{64}$/)
    expect(value).not.toContain('203.0.113.7')
  })

  it('does not trust a generic forwarded address', () => {
    expect(createRateLimitIdentity(new Headers({'x-forwarded-for': '203.0.113.7'}), 1_788_200_000_000, 's'.repeat(32))).toBeNull()
  })

  it('requires a non-placeholder signing secret in production', () => {
    expect(() => requireWebRateLimitIdentitySecret({WEB_API_RATE_LIMIT_SIGNING_SECRET: undefined})).toThrow('Invalid Web rate limit environment')
    expect(() => requireWebRateLimitIdentitySecret({WEB_API_RATE_LIMIT_SIGNING_SECRET: 'short'})).toThrow('Invalid Web rate limit environment')
    expect(() => requireWebRateLimitIdentitySecret({WEB_API_RATE_LIMIT_SIGNING_SECRET: 'x'.repeat(32)})).toThrow('Invalid Web rate limit environment')
    expect(requireWebRateLimitIdentitySecret({WEB_API_RATE_LIMIT_SIGNING_SECRET: 'secure-web-api-rate-limit-secret-123'})).toBe('secure-web-api-rate-limit-secret-123')
  })
})
