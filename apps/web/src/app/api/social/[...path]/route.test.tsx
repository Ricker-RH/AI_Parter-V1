import {afterEach, describe, expect, it, vi} from 'vitest'
import {DELETE, PUT} from './route.js'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.AIFANS_API_URL
  delete process.env.NEXT_PUBLIC_AIFANS_API_URL
})

describe('same-origin social mutation proxy', () => {
  it('forwards only an allowed mutation and its request cookie to the server API URL', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example/'
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({created: true}), {status: 200, headers: {'content-type': 'application/json'}}))
    vi.stubGlobal('fetch', upstream)
    const request = new Request('https://web.example/api/social/posts/22222222-2222-4222-8222-222222222222/like', {method: 'PUT', headers: {cookie: 'session=real'}})

    const response = await PUT(request, {params: Promise.resolve({path: ['posts', '22222222-2222-4222-8222-222222222222', 'like']})})

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({created: true})
    expect(upstream).toHaveBeenCalledWith('https://internal-api.example/v1/posts/22222222-2222-4222-8222-222222222222/like', expect.objectContaining({cache: 'no-store', credentials: 'include', headers: {cookie: 'session=real'}, method: 'PUT'}))
  })

  it('rejects paths outside like, bookmark, and follow without contacting the API', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const request = new Request('https://web.example/api/social/admin/delete', {method: 'DELETE'})

    const response = await DELETE(request, {params: Promise.resolve({path: ['admin', 'delete']})})

    expect(response.status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('fails safely when the API is not configured', async () => {
    const request = new Request('https://web.example/api/social/profiles/11111111-1111-4111-8111-111111111111/follow', {method: 'PUT'})
    const response = await PUT(request, {params: Promise.resolve({path: ['profiles', '11111111-1111-4111-8111-111111111111', 'follow']})})
    expect(response.status).toBe(503)
  })
})
