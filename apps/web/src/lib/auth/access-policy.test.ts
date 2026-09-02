import {describe, expect, it, vi} from 'vitest'
import {getOptionalPageAccess, requireAuthenticatedPage} from './access-policy.js'

describe('requireAuthenticatedPage', () => {
  it('returns a non-empty token without redirecting', async () => {
    const redirect = vi.fn()
    await expect(requireAuthenticatedPage({locale: 'en', returnTo: '/en/messages', getToken: async () => 'token', redirect})).resolves.toEqual({status: 'authenticated', token: 'token'})
    expect(redirect).not.toHaveBeenCalled()
  })

  it('redirects an anonymous visitor to the encoded safe return target', async () => {
    const redirect = vi.fn()
    await expect(requireAuthenticatedPage({locale: 'en', returnTo: '/en/messages', getToken: async () => null, redirect})).resolves.toEqual({status: 'unavailable'})
    expect(redirect).toHaveBeenCalledWith('/en/auth/sign-in?next=%2Fen%2Fmessages')
  })

  it('keeps a token-provider failure unavailable and does not redirect as anonymous', async () => {
    const redirect = vi.fn()
    await expect(requireAuthenticatedPage({locale: 'en', returnTo: '/en/messages', getToken: async () => { throw new Error('provider failed') }, redirect})).resolves.toEqual({status: 'unavailable'})
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('getOptionalPageAccess', () => {
  it('keeps anonymous public-page visitors on the requested page', async () => {
    const redirect = vi.fn()

    await expect(getOptionalPageAccess({getToken: async () => null})).resolves.toEqual({status: 'anonymous'})
    expect(redirect).not.toHaveBeenCalled()
  })

  it('reuses a non-empty token for optional personalized reads', async () => {
    await expect(getOptionalPageAccess({getToken: async () => 'token'})).resolves.toEqual({status: 'authenticated', token: 'token'})
  })

  it('downgrades a token provider timeout to anonymous and clears its timer', async () => {
    vi.useFakeTimers()
    try {
      const access = getOptionalPageAccess({getToken: () => new Promise<string>(() => undefined), timeoutMs: 25})

      await vi.advanceTimersByTimeAsync(25)

      await expect(access).resolves.toEqual({status: 'anonymous'})
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('handles a provider rejection that arrives after the optional timeout', async () => {
    vi.useFakeTimers()
    let reject!: (error: Error) => void
    const provider = new Promise<string>((_resolve, rejectProvider) => { reject = rejectProvider })
    try {
      const access = getOptionalPageAccess({getToken: () => provider, timeoutMs: 25})

      await vi.advanceTimersByTimeAsync(25)
      reject(new Error('late provider rejection'))

      await expect(access).resolves.toEqual({status: 'anonymous'})
      await Promise.resolve()
    } finally {
      vi.useRealTimers()
    }
  })
})
