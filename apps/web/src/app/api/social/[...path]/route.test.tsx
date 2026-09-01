import {afterEach, describe, expect, it, vi} from 'vitest'
vi.mock('../../../../lib/auth/server.js', () => ({getApiBearerToken: vi.fn(async () => 'signed-jwt')}))
import {DELETE, POST, PUT} from './route.js'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.AIFANS_API_URL
  delete process.env.NEXT_PUBLIC_AIFANS_API_URL
  delete process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET
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

  it('creates a trusted identity without forwarding browser credentials or forged identity headers', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET = 's'.repeat(32)
    const upstream = vi.fn().mockResolvedValue(Response.json({created: true}))
    vi.stubGlobal('fetch', upstream)
    const request = new Request('https://web.example/api/social/posts/22222222-2222-4222-8222-222222222222/like', {method: 'PUT', headers: {origin:'https://web.example', cookie:'session=real', authorization:'Bearer forged', 'x-aifans-rate-limit-identity':'forged', 'x-vercel-forwarded-for':'203.0.113.7, 10.0.0.1'}})
    await PUT(request, {params: Promise.resolve({path: ['posts', '22222222-2222-4222-8222-222222222222', 'like']})})
    const headers = new Headers((upstream.mock.calls[0]?.[1] as RequestInit).headers)
    expect(headers.get('x-aifans-rate-limit-identity')).toMatch(/^v1\.\d+\.[a-f0-9]{64}\.[a-f0-9]{64}$/)
    expect(headers.get('authorization')).toBe('Bearer signed-jwt')
    for (const name of ['cookie', 'x-vercel-forwarded-for']) expect(headers.has(name)).toBe(false)
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

  it('rejects declared and streamed oversized comment bodies before upstream auth transport',async()=>{process.env.AIFANS_API_URL='https://internal-api.example';const upstream=vi.fn();vi.stubGlobal('fetch',upstream);const path=['posts','22222222-2222-4222-8222-222222222222','comments'];const url='https://web.example/api/social/'+path.join('/');for(const request of [new Request(url,{method:'POST',headers:{origin:'https://web.example','content-type':'application/json','content-length':'9000'},body:'{}'}),new Request(url,{method:'POST',headers:{origin:'https://web.example','content-type':'application/json'},body:JSON.stringify({body:'x'.repeat(9000)})})])expect((await POST(request,{params:Promise.resolve({path})})).status).toBe(413);expect(upstream).not.toHaveBeenCalled()})
  it('rejects every mutation query instead of silently dropping it',async()=>{process.env.AIFANS_API_URL='https://internal-api.example';const upstream=vi.fn();vi.stubGlobal('fetch',upstream);const path=['notifications','22222222-2222-4222-8222-222222222222','read'];const request=new Request('https://web.example/api/social/'+path.join('/')+'?actor=one&actor=two',{method:'PUT',headers:{origin:'https://web.example'}});expect((await PUT(request,{params:Promise.resolve({path})})).status).toBe(400);expect(upstream).not.toHaveBeenCalled()})
})
