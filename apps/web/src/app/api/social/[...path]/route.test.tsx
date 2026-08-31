import {afterEach, describe, expect, it, vi} from 'vitest'
vi.mock('../../../../lib/auth/server.js', () => ({getApiBearerToken: vi.fn(async () => 'signed-jwt')}))
import {DELETE, POST, PUT} from './route.js'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.AIFANS_API_URL
  delete process.env.NEXT_PUBLIC_AIFANS_API_URL
})

describe('same-origin social mutation proxy', () => {
  it('forwards only an allowed mutation with a short-lived bearer token', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example/'
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({created: true}), {status: 200, headers: {'content-type': 'application/json'}}))
    vi.stubGlobal('fetch', upstream)
    const request = new Request('https://web.example/api/social/posts/22222222-2222-4222-8222-222222222222/like', {method: 'PUT', headers: {cookie: 'session=real', origin:'https://web.example'}})

    const response = await PUT(request, {params: Promise.resolve({path: ['posts', '22222222-2222-4222-8222-222222222222', 'like']})})

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({created: true})
    expect(upstream).toHaveBeenCalledWith('https://internal-api.example/v1/posts/22222222-2222-4222-8222-222222222222/like', expect.objectContaining({cache: 'no-store', headers: {authorization: 'Bearer signed-jwt'}, method: 'PUT'}))
  })

  it('rejects paths outside like, bookmark, and follow without contacting the API', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const request = new Request('https://web.example/api/social/admin/delete', {method: 'DELETE',headers:{origin:'https://web.example'}})

    const response = await DELETE(request, {params: Promise.resolve({path: ['admin', 'delete']})})

    expect(response.status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('fails safely when the API is not configured', async () => {
    const request = new Request('https://web.example/api/social/profiles/11111111-1111-4111-8111-111111111111/follow', {method: 'PUT',headers:{origin:'https://web.example'}})
    const response = await PUT(request, {params: Promise.resolve({path: ['profiles', '11111111-1111-4111-8111-111111111111', 'follow']})})
    expect(response.status).toBe(503)
  })

  it('forwards comments exactly and rejects cross-origin or duplicate-key bodies', async () => {
    process.env.AIFANS_API_URL='https://internal-api.example'
    const upstream=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'ok'}),{status:201,headers:{'content-type':'application/json'}}))
    vi.stubGlobal('fetch',upstream)
    const path=['posts','22222222-2222-4222-8222-222222222222','comments']
    const request=new Request('https://web.example/api/social/'+path.join('/'),{method:'POST',headers:{origin:'https://web.example','content-type':'application/json'},body:'{"body":"hello"}'})
    expect((await POST(request,{params:Promise.resolve({path})})).status).toBe(201)
    expect(upstream).toHaveBeenCalledWith('https://internal-api.example/v1/'+path.join('/'),expect.objectContaining({method:'POST',body:'{"body":"hello"}'}))
    const duplicate=new Request('https://web.example/api/social/'+path.join('/'),{method:'POST',headers:{origin:'https://web.example','content-type':'application/json'},body:'{"body":"one","body":"two"}'})
    expect((await POST(duplicate,{params:Promise.resolve({path})})).status).toBe(422)
    const crossOrigin=new Request('https://web.example/api/social/'+path.join('/'),{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{"body":"hello"}'})
    expect((await POST(crossOrigin,{params:Promise.resolve({path})})).status).toBe(403)
  })
})
