import {describe, expect, it, vi} from 'vitest'
import {requireAuthenticatedPage} from './access-policy.js'

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
