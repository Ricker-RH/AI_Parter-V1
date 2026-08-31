import {afterEach, describe, expect, it, vi} from 'vitest'
import {fetchAifansApi, readApiBaseUrl} from './server-api.js'

afterEach(() => {
  delete process.env.AIFANS_API_URL
})

describe('authenticated server API transport', () => {
  it('uses only the private API URL and a short-lived bearer token', async () => {
    process.env.AIFANS_API_URL = 'https://api.example/'
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 204}))
    await fetchAifansApi('/v1/me', {
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
    await fetchAifansApi('/health', {fetcher, getToken: async () => null})
    expect(fetcher).toHaveBeenCalledWith('https://api.example/health', expect.objectContaining({headers: {}}))
  })

  it('rejects absolute or non-API paths before any network request', async () => {
    process.env.AIFANS_API_URL = 'https://api.example'
    const fetcher = vi.fn()
    await expect(fetchAifansApi('https://attacker.example/v1/me', {fetcher, getToken: async () => null})).rejects.toThrow('Invalid API path')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('aborts an upstream request at the bounded transport timeout', async () => {
    process.env.AIFANS_API_URL='https://api.example'
    const fetcher=vi.fn((_url:string|URL|Request,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true})))
    await expect(fetchAifansApi('/v1/feed',{fetcher,getToken:async()=>null,timeoutMs:1})).rejects.toThrow('timeout')
  })

  it('uses the same deadline while waiting for an auth token', async () => {
    process.env.AIFANS_API_URL='https://api.example'
    const fetcher=vi.fn()
    await expect(fetchAifansApi('/v1/feed',{fetcher,getToken:()=>new Promise(()=>undefined),timeoutMs:1})).rejects.toThrow('timeout')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
