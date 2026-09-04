import {afterEach, describe, expect, it, vi} from 'vitest'
const {getApiBearerToken}=vi.hoisted(()=>({getApiBearerToken:vi.fn(async()=> 'signed-jwt')}))
vi.mock('./auth/server.js', () => ({getApiBearerToken}))
import {fetchCurrentAccount,fetchCurrentAccountResult} from './current-account.js'

const account = {id: '11111111-1111-4111-8111-111111111111', kind: 'human', username: 'aifans_user', displayName: 'AIFANS User', preferredLocale: 'en', creatorModeEnabled: false, profileVersion: 1, background: {type: 'color' as const, colorKey: 'paper' as const}}

afterEach(() => {
  vi.unstubAllGlobals()
  getApiBearerToken.mockClear()
  delete process.env.AIFANS_API_URL
  delete process.env.NEXT_PUBLIC_AIFANS_API_URL
})

describe('current account client', () => {
  it('fetches and strictly parses the current account with bearer auth', async () => {
    process.env.AIFANS_API_URL = 'https://server.example/'
    const request = vi.fn().mockResolvedValue(Response.json(account))
    vi.stubGlobal('fetch', request)
    await expect(fetchCurrentAccount({cookie: 'session=real'})).resolves.toEqual(account)
    expect(request).toHaveBeenCalledWith('https://server.example/v1/me', expect.objectContaining({cache: 'no-store', headers: {authorization: 'Bearer signed-jwt'}}))
  })

  it('reuses a protected page token without a second token-provider lookup', async () => {
    process.env.AIFANS_API_URL = 'https://server.example/'
    const request = vi.fn().mockResolvedValue(Response.json(account))
    vi.stubGlobal('fetch', request)

    await expect(fetchCurrentAccountResult({token: 'guarded-jwt'})).resolves.toEqual({status: 'authenticated', account})

    expect(request).toHaveBeenCalledWith('https://server.example/v1/me', expect.objectContaining({cache: 'no-store', headers: {authorization: 'Bearer guarded-jwt'}}))
    expect(getApiBearerToken).not.toHaveBeenCalled()
  })

  it('keeps an upstream 401 distinguishable as auth-required', async () => {
    process.env.AIFANS_API_URL = 'https://server.example'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 401})))

    await expect(fetchCurrentAccountResult({token: 'guarded-jwt'})).resolves.toEqual({status: 'auth-required'})
  })

  it('treats configuration, authentication, transport, and malformed responses as signed out', async () => {
    await expect(fetchCurrentAccount()).resolves.toBeNull()
    process.env.AIFANS_API_URL = 'https://server.example'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({code: 'AUTH_REQUIRED'}, {status: 401})))
    await expect(fetchCurrentAccount()).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({...account, username: 'not a valid username'})))
    await expect(fetchCurrentAccount()).resolves.toBeNull()
  })

  it('aborts a hanging upstream account request and treats it as signed out', async () => {
    process.env.AIFANS_API_URL = 'https://server.example'
    const request = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true})
    }))
    vi.stubGlobal('fetch', request)
    await expect(fetchCurrentAccount({timeoutMs: 5} as never)).resolves.toBeNull()
    expect((request.mock.calls[0]?.[1].signal as AbortSignal | undefined)?.aborted).toBe(true)
  })
})
