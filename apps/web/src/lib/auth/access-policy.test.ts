import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {getOptionalPageAccess, requireAuthenticatedPage, viewerScopeForToken} from './access-policy.js'

const {connection, getApiBearerToken} = vi.hoisted(() => ({
  connection: vi.fn<() => Promise<void>>(),
  getApiBearerToken: vi.fn<() => Promise<string | null>>(),
}))
vi.mock('next/server', () => ({connection}))
vi.mock('./server', () => ({getApiBearerToken}))

beforeEach(() => {
  connection.mockReset()
  connection.mockResolvedValue(undefined)
  getApiBearerToken.mockReset()
  getApiBearerToken.mockResolvedValue(null)
})

afterEach(() => {
  connection.mockReset()
  getApiBearerToken.mockReset()
})

describe('requireAuthenticatedPage', () => {
  it('waits for a live request before starting the default bearer provider', async () => {
    const redirect = vi.fn()
    const access = requireAuthenticatedPage({locale: 'en', returnTo: '/en/messages', redirect})

    await expect(access).resolves.toEqual({status: 'unavailable'})
    expect(connection).toHaveBeenCalledOnce()
    expect(connection.mock.invocationCallOrder[0]).toBeLessThan(getApiBearerToken.mock.invocationCallOrder[0] ?? Infinity)
  })

  it('does not swallow the request-boundary signal', async () => {
    const boundary = new Error('NEXT_POSTPONE')
    connection.mockRejectedValueOnce(boundary)

    await expect(requireAuthenticatedPage({locale: 'en', returnTo: '/en/messages'})).rejects.toBe(boundary)
    expect(getApiBearerToken).not.toHaveBeenCalled()
  })

  it('returns a non-empty token without redirecting', async () => {
    const redirect = vi.fn()
    await expect(requireAuthenticatedPage({locale: 'en', returnTo: '/en/messages', getToken: async () => 'token', redirect})).resolves.toEqual({status: 'authenticated', token: 'token', viewerScope: viewerScopeForToken('token')})
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
  it('waits for a live request before starting the default bearer provider', async () => {
    const access = getOptionalPageAccess()

    await expect(access).resolves.toEqual({status: 'anonymous'})
    expect(connection).toHaveBeenCalledOnce()
    expect(connection.mock.invocationCallOrder[0]).toBeLessThan(getApiBearerToken.mock.invocationCallOrder[0] ?? Infinity)
  })

  it('does not swallow the request-boundary signal', async () => {
    const boundary = new Error('NEXT_POSTPONE')
    connection.mockRejectedValueOnce(boundary)

    await expect(getOptionalPageAccess()).rejects.toBe(boundary)
    expect(getApiBearerToken).not.toHaveBeenCalled()
  })

  it('derives a stable opaque viewer scope without exposing a bearer token', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.viewer-token.signature'
    const scope = viewerScopeForToken(token)
    expect(scope).toBe(viewerScopeForToken(token))
    expect(scope).not.toBe(viewerScopeForToken(`${token}-other`))
    expect(scope).not.toContain(token)
    expect(scope).not.toBe(token)
  })
  it('keeps anonymous public-page visitors on the requested page', async () => {
    const redirect = vi.fn()

    await expect(getOptionalPageAccess({getToken: async () => null})).resolves.toEqual({status: 'anonymous'})
    expect(redirect).not.toHaveBeenCalled()
  })

  it('reuses a non-empty token for optional personalized reads', async () => {
    await expect(getOptionalPageAccess({getToken: async () => 'token'})).resolves.toEqual({status: 'authenticated', token: 'token', viewerScope: viewerScopeForToken('token')})
  })

  it('keeps a token provider timeout unresolved rather than misclassifying the viewer as anonymous', async () => {
    vi.useFakeTimers()
    try {
      const access = getOptionalPageAccess({getToken: () => new Promise<string>(() => undefined), timeoutMs: 25})

      await vi.advanceTimersByTimeAsync(25)

      await expect(access).resolves.toEqual({status: 'unavailable'})
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

      await expect(access).resolves.toEqual({status: 'unavailable'})
      await Promise.resolve()
    } finally {
      vi.useRealTimers()
    }
  })
})
