import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {fetchAifansApi, readApiBaseUrl} from './server-api.js'

const {getVercelOidcToken, getApiBearerToken} = vi.hoisted(() => ({
  getVercelOidcToken: vi.fn<() => Promise<string>>(),
  getApiBearerToken: vi.fn<() => Promise<string | null>>(),
}))
vi.mock('@vercel/oidc', () => ({getVercelOidcToken}))
vi.mock('./auth/server', () => ({getApiBearerToken}))

beforeEach(() => {
  getVercelOidcToken.mockReset()
  getVercelOidcToken.mockImplementation(async () => {
    if (!process.env.VERCEL_OIDC_TOKEN) throw new Error('managed OIDC token is missing')
    return process.env.VERCEL_OIDC_TOKEN
  })
  getApiBearerToken.mockReset()
  getApiBearerToken.mockResolvedValue(null)
})

afterEach(() => {
  getVercelOidcToken.mockReset()
  getApiBearerToken.mockReset()
  delete process.env.AIFANS_API_URL
  delete process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET
  delete process.env.VERCEL
  delete process.env.VERCEL_ENV
  delete process.env.VERCEL_OIDC_TOKEN
})

function unexpiredOidcToken(): string {
  const payload = Buffer.from(JSON.stringify({exp: Math.floor(Date.now() / 1000) + 3600})).toString('base64url')
  return `eyJhbGciOiJSUzI1NiJ9.${payload}.trusted-signature`
}

describe('authenticated server API transport', () => {
  it.each([
    ['public-cache', '/v1/feed', {}],
    ['private-cache', '/v1/me', {getToken: async (): Promise<null> => null, trustedClientHeaders: new Headers({'x-vercel-trusted-oidc-idp-token': 'trusted-header-forgery'})}],
    ['live-no-store', '/v1/me', {getToken: async (): Promise<null> => null, trustedClientHeaders: new Headers({'x-vercel-trusted-oidc-idp-token': 'trusted-header-forgery'})}],
  ] as const)('adds the Vercel trusted OIDC token to %s requests', async (policy, path, policyOptions) => {
    process.env.AIFANS_API_URL = 'https://api.example'
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'preview'
    process.env.VERCEL_OIDC_TOKEN = unexpiredOidcToken()
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 204}))

    await fetchAifansApi(path, {
      policy,
      fetcher,
      ...policyOptions,
      requestInit: {headers: {'x-vercel-trusted-oidc-idp-token': 'caller-forgery'}},
    } as Parameters<typeof fetchAifansApi>[1])

    const headers = new Headers((fetcher.mock.calls[0]?.[1] as RequestInit).headers)
    expect(headers.get('x-vercel-trusted-oidc-idp-token')).toBe(process.env.VERCEL_OIDC_TOKEN)
  })

  it('does not acquire or forward OIDC outside the Vercel server runtime', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    process.env.VERCEL_OIDC_TOKEN = unexpiredOidcToken()
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 204}))

    await fetchAifansApi('/health', {
      policy: 'public-cache',
      fetcher,
      requestInit: {headers: {'x-vercel-trusted-oidc-idp-token': 'caller-forgery'}},
    })

    const headers = new Headers((fetcher.mock.calls[0]?.[1] as RequestInit).headers)
    expect(headers.has('x-vercel-trusted-oidc-idp-token')).toBe(false)
    expect(getVercelOidcToken).not.toHaveBeenCalled()
  })

  it('fails closed when Vercel OIDC token acquisition fails', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'preview'
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 204}))

    await expect(fetchAifansApi('/health', {policy: 'public-cache', fetcher})).rejects.toThrow('Failed to acquire Vercel OIDC token')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses the transport deadline while acquiring a Vercel OIDC token', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'preview'
    getVercelOidcToken.mockImplementation(() => new Promise(() => undefined))
    const fetcher = vi.fn()

    await expect(fetchAifansApi('/health', {policy: 'public-cache', fetcher, timeoutMs: 1})).rejects.toThrow('timeout')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('starts token providers in the originating request context', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'preview'
    process.env.VERCEL_OIDC_TOKEN = unexpiredOidcToken()
    const getToken = vi.fn(async (): Promise<null> => null)
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 204}))
    const request = fetchAifansApi('/v1/me', {policy: 'private-cache', fetcher, getToken})

    try {
      expect([getVercelOidcToken.mock.calls.length, getToken.mock.calls.length]).toEqual([1, 1])
    } finally {
      await request
    }
  })

  it('starts the default bearer provider in the originating request context', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'preview'
    process.env.VERCEL_OIDC_TOKEN = unexpiredOidcToken()
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 204}))
    const request = fetchAifansApi('/v1/me', {policy: 'private-cache', fetcher})

    try {
      expect(getApiBearerToken).toHaveBeenCalledOnce()
    } finally {
      await request
    }
  })

  it('starts OIDC and bearer acquisition together so both finish within one deadline', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'preview'
    const oidcToken = unexpiredOidcToken()
    getVercelOidcToken.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(oidcToken), 60)))
    const getToken = vi.fn(() => new Promise<string>((resolve) => setTimeout(() => resolve('signed-jwt'), 60)))
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 204}))

    const request = fetchAifansApi('/v1/me', {policy: 'private-cache', fetcher, getToken, timeoutMs: 100})
    await vi.waitFor(() => expect(getVercelOidcToken).toHaveBeenCalledOnce())
    expect(getToken).toHaveBeenCalledOnce()
    await request

    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('consumes a later acquisition rejection after its peer has already failed', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'preview'
    const unhandledRejection = vi.fn()
    process.on('unhandledRejection', unhandledRejection)
    getVercelOidcToken.mockRejectedValue(new Error('OIDC unavailable'))
    const getToken = vi.fn(() => new Promise<string>((_resolve, reject) => setTimeout(() => reject(new Error('bearer unavailable')), 5)))
    const fetcher = vi.fn()

    try {
      await expect(fetchAifansApi('/v1/me', {policy: 'private-cache', fetcher, getToken})).rejects.toThrow('Failed to acquire Vercel OIDC token')
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(getToken).toHaveBeenCalledOnce()
      expect(unhandledRejection).not.toHaveBeenCalled()
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandledRejection)
    }
  })

  it('handles a later OIDC rejection when bearer acquisition throws synchronously', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'preview'
    const unhandledRejection = vi.fn()
    process.on('unhandledRejection', unhandledRejection)
    getVercelOidcToken.mockImplementation(() => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('OIDC unavailable')), 5)))
    const getToken = vi.fn(() => { throw new Error('bearer unavailable') })
    const fetcher = vi.fn()

    try {
      await expect(fetchAifansApi('/v1/me', {policy: 'private-cache', fetcher, getToken})).rejects.toThrow('bearer unavailable')
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(getToken).toHaveBeenCalledOnce()
      expect(unhandledRejection).not.toHaveBeenCalled()
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandledRejection)
    }
  })

  it('uses only the private API URL and a short-lived bearer token', async () => {
    process.env.AIFANS_API_URL = 'https://api.example/'
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 204}))
    await fetchAifansApi('/v1/me', {
      policy: 'private-cache',
      fetcher,
      getToken: async () => 'signed-jwt',
      requestInit: {headers: {cookie: 'must-not-cross-boundary', 'x-request-id': 'request-1'}},
    })
    expect(fetcher).toHaveBeenCalledWith('https://api.example/v1/me', expect.objectContaining({
      cache: 'no-store',
      headers: {authorization: 'Bearer signed-jwt', 'x-request-id': 'request-1'},
    }))
  })

  it('allows public API reads without a token but never uses a public browser fallback', async () => {
    process.env.NEXT_PUBLIC_AIFANS_API_URL = 'https://public.example'
    expect(readApiBaseUrl()).toBeNull()
    process.env.AIFANS_API_URL = 'https://api.example'
    const fetcher = vi.fn().mockResolvedValue(Response.json({status: 'ok'}))
    await fetchAifansApi('/health', {policy: 'public-cache', fetcher})
    expect(fetcher).toHaveBeenCalledWith('https://api.example/health', expect.objectContaining({headers: {}}))
  })

  it('rejects absolute or non-API paths before any network request', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    const fetcher = vi.fn()
    await expect(fetchAifansApi('https://attacker.example/v1/me', {policy: 'public-cache', fetcher})).rejects.toThrow('Invalid API path')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('aborts an upstream request at the bounded transport timeout', async () => {
    process.env.AIFANS_API_URL='https://api.example'
    const fetcher=vi.fn((_url:string|URL|Request,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true})))
    await expect(fetchAifansApi('/v1/feed',{policy:'public-cache',fetcher,timeoutMs:1})).rejects.toThrow('timeout')
  })

  it('uses the same deadline while waiting for an auth token', async () => {
    process.env.AIFANS_API_URL='https://api.example'
    const fetcher=vi.fn()
    await expect(fetchAifansApi('/v1/feed',{policy:'private-cache',fetcher,getToken:()=>new Promise(()=>undefined),timeoutMs:1})).rejects.toThrow('timeout')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('forwards only server-acquired identity, correlation, content type, and bearer auth', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET = 's'.repeat(32)
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 204}))
    await fetchAifansApi('/v1/chat/11111111-1111-4111-8111-111111111111/messages', {
      policy: 'live-no-store',
      fetcher,
      getToken: async () => 'signed-jwt',
      trustedClientHeaders: new Headers({'x-vercel-forwarded-for': '203.0.113.7, 10.0.0.1'}),
      requestInit: {headers: {
        authorization: 'Bearer caller-token', cookie: 'session=secret', 'x-forwarded-for': '198.51.100.3',
        'x-aifans-rate-limit-identity': 'forged', 'content-type': 'application/json', 'x-request-id': 'request-1',
      }},
    })
    const outbound = fetcher.mock.calls[0]?.[1] as RequestInit
    const headers = new Headers(outbound.headers)
    expect(headers.get('x-aifans-rate-limit-identity')).toMatch(/^v1\.\d+\.[a-f0-9]{64}\.[a-f0-9]{64}$/)
    expect(headers.get('authorization')).toBe('Bearer signed-jwt')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-request-id')).toBe('request-1')
    for (const name of ['cookie', 'x-forwarded-for', 'x-vercel-forwarded-for']) expect(headers.has(name)).toBe(false)
  })

  it('forwards only an explicitly trusted live idempotency key', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    const fetcher = vi.fn().mockResolvedValue(Response.json({created: true}))
    const trusted = '22222222-2222-4222-8222-222222222222'
    await fetchAifansApi(`/v1/posts/${trusted}/share`, {
      policy: 'live-no-store',
      fetcher,
      getToken: async () => null,
      trustedIdempotencyKey: trusted,
      requestInit: {method: 'POST', headers: {'idempotency-key': '33333333-3333-4333-8333-333333333333'}},
    })
    const headers = new Headers((fetcher.mock.calls[0]?.[1] as RequestInit).headers)
    expect(headers.get('idempotency-key')).toBe(trusted)
    await expect(fetchAifansApi(`/v1/posts/${trusted}/share`, {
      policy: 'live-no-store',
      fetcher,
      trustedIdempotencyKey: 'invalid',
      requestInit: {method: 'POST'},
    })).rejects.toThrow('Invalid trusted idempotency key')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('drops a forged idempotency key when no trusted key is supplied', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    const fetcher = vi.fn().mockResolvedValue(Response.json({created: true}))
    await fetchAifansApi('/v1/posts/22222222-2222-4222-8222-222222222222/share', {
      policy: 'live-no-store',
      fetcher,
      getToken: async () => null,
      requestInit: {method: 'POST', headers: {'idempotency-key': '33333333-3333-4333-8333-333333333333'}},
    })
    const headers = new Headers((fetcher.mock.calls[0]?.[1] as RequestInit).headers)
    expect(headers.has('idempotency-key')).toBe(false)
  })

  it('requires an explicit request policy at runtime', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    await expect(fetchAifansApi('/health', {} as never)).rejects.toThrow('Explicit API request policy required')
  })

  it('keeps public reads cacheable and prevents authentication from entering a public cache', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 204}))

    await fetchAifansApi('/v1/feed?kind=for_you&locale=en', {policy: 'public-cache', fetcher})

    expect(fetcher).toHaveBeenCalledWith('https://api.example/v1/feed?kind=for_you&locale=en', expect.objectContaining({headers: {}}))
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).cache).toBeUndefined()
    await expect(fetchAifansApi('/v1/feed?kind=for_you&locale=en', {
      policy: 'public-cache',
      fetcher,
      getToken: async () => 'must-not-be-cached',
    } as never)).rejects.toThrow('Public API cache cannot use authentication')
  })
})
