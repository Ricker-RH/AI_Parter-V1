import {afterEach, describe, expect, it, vi} from 'vitest'
import {GET} from './route.js'

const account = {id: '11111111-1111-4111-8111-111111111111', kind: 'human', username: 'aifans_user', displayName: 'AIFANS User', preferredLocale: 'en', creatorModeEnabled: false}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.AIFANS_API_URL
})

describe('analytics account endpoint', () => {
  it('forwards the request cookie but exposes only the parsed AIFANS profile UUID', async () => {
    process.env.AIFANS_API_URL = 'https://server.example'
    const upstream = vi.fn().mockResolvedValue(Response.json(account))
    vi.stubGlobal('fetch', upstream)
    const response = await GET(new Request('https://web.example/api/account', {headers: {cookie: 'session=real'}}))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({profileId: account.id})
    expect(upstream).toHaveBeenCalledWith('https://server.example/v1/me', expect.objectContaining({headers: {cookie: 'session=real'}, signal: expect.any(AbortSignal)}))
  })

  it('returns an empty signed-out response for upstream authentication and validation failures', async () => {
    process.env.AIFANS_API_URL = 'https://server.example'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({code: 'AUTH_REQUIRED'}, {status: 401})))
    expect((await GET(new Request('https://web.example/api/account'))).status).toBe(204)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({...account, id: 'auth-subject-not-a-profile-uuid'})))
    expect((await GET(new Request('https://web.example/api/account'))).status).toBe(204)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({...account, email: 'must-not-leak@example.com'})))
    expect((await GET(new Request('https://web.example/api/account'))).status).toBe(204)
  })
})
