import {afterEach, describe, expect, it, vi} from 'vitest'
const {getApiBearerToken, revalidateTag} = vi.hoisted(() => ({
  getApiBearerToken: vi.fn(async (): Promise<string | null> => 'signed-jwt'),
  revalidateTag: vi.fn(),
}))
vi.mock('../../../../lib/auth/server.js', () => ({getApiBearerToken}))
vi.mock('next/cache', () => ({revalidateTag}))
import {DELETE, GET, POST, PUT} from './route.js'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.AIFANS_API_URL
  delete process.env.NEXT_PUBLIC_AIFANS_API_URL
  delete process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET
  revalidateTag.mockReset()
  getApiBearerToken.mockReset()
  getApiBearerToken.mockResolvedValue('signed-jwt')
})

describe('same-origin social mutation proxy', () => {
  const postId = '22222222-2222-4222-8222-222222222222'

  it('proxies only same-origin empty share POSTs with strict private responses and one trusted key', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET = 's'.repeat(32)
    const upstream = vi.fn()
      .mockResolvedValueOnce(Response.json({created: true}, {status: 200, headers: {'x-request-id': 'upstream-id-1'}}))
      .mockResolvedValueOnce(Response.json({created: false}, {status: 200, headers: {'x-request-id': 'upstream-id-2'}}))
      .mockResolvedValueOnce(Response.json({created: false}, {status: 200, headers: {'x-request-id': 'upstream-id-3'}}))
      .mockResolvedValueOnce(Response.json({created: false}, {status: 200, headers: {'x-request-id': 'upstream-id-4'}}))
      .mockResolvedValueOnce(Response.json({created: false}, {status: 200, headers: {'x-request-id': 'upstream-id-5'}}))
    vi.stubGlobal('fetch', upstream)
    const path = ['posts', postId, 'share']
    const idempotencyKey = '33333333-3333-4333-8333-333333333333'
    const inputs: Array<[string | undefined, string | undefined]> = [
      [undefined, undefined],
      ['{}', 'application/json'],
      ['{}', 'application/json; charset=utf-8'],
      ['   ', 'application/json'],
      ['{}', 'application/json; charset="UTF-8"'],
    ]
    for (const [index, [body, contentType]] of inputs.entries()) {
      const headers = new Headers({
        origin: 'https://web.example',
        'idempotency-key': idempotencyKey,
        'x-vercel-forwarded-for': '203.0.113.7',
        authorization: 'Bearer forged',
        'x-aifans-rate-limit-identity': 'forged',
      })
      if (contentType !== undefined) headers.set('content-type', contentType)
      const response = await POST(new Request(`https://web.example/api/social/${path.join('/')}`, {
        method: 'POST',
        headers,
        ...(body === undefined ? {} : {body}),
      }), {params: Promise.resolve({path})})
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(await response.json()).toEqual({created: index === 0})
    }
    for (const [, init] of upstream.mock.calls) {
      const sent = new Headers((init as RequestInit).headers)
      expect((init as RequestInit).body).toBeUndefined()
      expect(sent.has('content-type')).toBe(false)
      expect(sent.get('authorization')).toBe('Bearer signed-jwt')
      expect(sent.get('idempotency-key')).toBe(idempotencyKey)
      expect(sent.get('x-aifans-rate-limit-identity')).toMatch(/^v1\./)
      for (const name of ['cookie', 'x-vercel-forwarded-for']) expect(sent.has(name)).toBe(false)
    }
    expect(revalidateTag).toHaveBeenCalledTimes(inputs.length * 2)
    expect(revalidateTag).toHaveBeenCalledWith('feed:for_you:en', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('feed:for_you:zh-CN', 'max')
  })

  it('proxies an anonymous share without Authorization and retains signed rate-limit enforcement', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET = 's'.repeat(32)
    getApiBearerToken.mockResolvedValueOnce(null)
    const upstream = vi.fn().mockResolvedValue(Response.json({created: true}))
    vi.stubGlobal('fetch', upstream)
    const path = ['posts', postId, 'share']
    const response = await POST(new Request(`https://web.example/api/social/${path.join('/')}`, {
      method: 'POST',
      headers: {
        origin: 'https://web.example',
        'idempotency-key': postId,
        'x-vercel-forwarded-for': '203.0.113.7',
        cookie: 'session=must-not-leak',
        authorization: 'Bearer forged',
        'x-aifans-rate-limit-identity': 'forged',
      },
    }), {params: Promise.resolve({path})})

    expect(response.status).toBe(200)
    const sent = new Headers((upstream.mock.calls[0]?.[1] as RequestInit).headers)
    expect(sent.has('authorization')).toBe(false)
    expect(sent.get('x-aifans-rate-limit-identity')).toMatch(/^v1\./)
    for (const name of ['cookie', 'x-vercel-forwarded-for']) expect(sent.has(name)).toBe(false)
  })

  it('accepts an empty streamed share body produced by the deployed Next runtime', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET = 's'.repeat(32)
    const upstream = vi.fn().mockResolvedValue(Response.json({created: true}))
    vi.stubGlobal('fetch', upstream)
    const path = ['posts', postId, 'share']
    const body = new ReadableStream<Uint8Array>({start(controller) { controller.close() }})
    const response = await POST(new Request(`https://web.example/api/social/${path.join('/')}`, {
      method: 'POST',
      headers: {origin: 'https://web.example', 'idempotency-key': postId},
      body,
      duplex: 'half',
    } as RequestInit), {params: Promise.resolve({path})})

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({created: true})
    expect(upstream).toHaveBeenCalledOnce()
  })

  it('rejects invalid share proxy requests before transport with private no-store errors', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const path = ['posts', postId, 'share']
    const url = `https://web.example/api/social/${path.join('/')}`
    const cases: Array<[Request, number]> = [
      [new Request(url, {method: 'POST', headers: {origin: 'https://evil.example', 'idempotency-key': postId}}), 403],
      [new Request(url, {method: 'POST', headers: {origin: 'https://web.example'}}), 400],
      [new Request(url, {method: 'POST', headers: {origin: 'https://web.example', 'idempotency-key': 'invalid'}}), 400],
      [new Request(`${url}?count=1`, {method: 'POST', headers: {origin: 'https://web.example', 'idempotency-key': postId}}), 400],
      [new Request(url, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/json', 'idempotency-key': postId}, body: '{"count":1}'}), 422],
      [new Request(url, {method: 'POST', headers: {origin: 'https://web.example', 'idempotency-key': postId}, body: '   '}), 422],
      [new Request(url, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'text/plain', 'idempotency-key': postId}, body: '{}'}), 422],
      [new Request(url, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/json; charset=latin1', 'idempotency-key': postId}, body: '{}'}), 422],
      [new Request(url, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/json; charset=utf-8; profile=x', 'idempotency-key': postId}, body: '{}'}), 422],
      [new Request(url, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/jsonx', 'idempotency-key': postId}, body: '{}'}), 422],
      [new Request(url, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/jsonp', 'idempotency-key': postId}, body: '{}'}), 422],
      [new Request(url, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/json', 'content-length': '8193', 'idempotency-key': postId}, body: '{}'}), 413],
      [new Request(url, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/json', 'content-length': '-1', 'idempotency-key': postId}, body: '{}'}), 413],
      [new Request(url, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/json', 'content-length': 'invalid', 'idempotency-key': postId}, body: '{}'}), 413],
      [new Request(url, {method: 'POST', headers: {origin: 'https://web.example', 'content-type': 'application/json', 'content-length': '1', 'idempotency-key': postId}, body: 'x'.repeat(8193)}), 413],
    ]
    for (const [request, status] of cases) {
      const response = await POST(request, {params: Promise.resolve({path})})
      expect(response.status).toBe(status)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
    expect(upstream).not.toHaveBeenCalled()
    expect(getApiBearerToken).not.toHaveBeenCalled()

    const wrongPath = ['profiles', postId, 'share']
    const wrong = await POST(new Request(`https://web.example/api/social/${wrongPath.join('/')}`, {
      method: 'POST', headers: {origin: 'https://web.example', 'idempotency-key': postId},
    }), {params: Promise.resolve({path: wrongPath})})
    expect(wrong.status).toBe(404)
    expect(wrong.headers.get('cache-control')).toBe('private, no-store')
  })

  it.each([
    [201, {created: true}],
    [200, {created: 'yes'}],
    [200, {created: true, internal: 'secret'}],
  ] as const)('redacts invalid successful share responses', async (status, payload) => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload, {status})))
    const path = ['posts', postId, 'share']
    const response = await POST(new Request(`https://web.example/api/social/${path.join('/')}`, {
      method: 'POST', headers: {origin: 'https://web.example', 'idempotency-key': postId},
    }), {params: Promise.resolve({path})})
    expect(response.status).toBe(502)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({code: 'SOCIAL_INVALID_RESPONSE'})
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('redacts upstream error fields and security-sensitive response headers', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    const path = ['posts', postId, 'share']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      code: 'RATE_LIMITED',
      message: 'Try later',
      requestId: 'body-request-id',
      internal: 'must-not-leak',
    }, {status: 429, headers: {
      'x-request-id': 'header-request-id',
      'set-cookie': 'admin=true',
      location: 'https://evil.example',
      'www-authenticate': 'Bearer secret',
      'retry-after': '3600',
      'access-control-allow-origin': '*',
    }})))

    const response = await POST(new Request(`https://web.example/api/social/${path.join('/')}`, {
      method: 'POST', headers: {origin: 'https://web.example', 'idempotency-key': postId},
    }), {params: Promise.resolve({path})})

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({code: 'RATE_LIMITED', message: 'Try later', requestId: 'body-request-id'})
    expect(Object.fromEntries(response.headers)).toEqual({
      'cache-control': 'private, no-store',
      'content-type': 'application/json',
      'x-request-id': 'header-request-id',
    })
    expect(revalidateTag).not.toHaveBeenCalled()
  })
  it('forwards only a UUID public-profile read with one opaque cursor', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    const upstream = vi.fn().mockImplementation(async () => Response.json({profile: {}, followerCount: 0, posts: {items: [], nextCursor: null}}))
    vi.stubGlobal('fetch', upstream)
    const path = ['profiles', '11111111-1111-4111-8111-111111111111']
    expect((await GET(new Request('https://web.example/api/social/profiles/11111111-1111-4111-8111-111111111111'), {params: Promise.resolve({path})})).status).toBe(200)
    expect(upstream).toHaveBeenCalledWith('https://internal-api.example/v1/profiles/11111111-1111-4111-8111-111111111111', expect.objectContaining({cache: 'no-store'}))
    expect((await GET(new Request('https://web.example/api/social/profiles/11111111-1111-4111-8111-111111111111?cursor=next_page'), {params: Promise.resolve({path})})).status).toBe(200)
    expect(upstream).toHaveBeenLastCalledWith('https://internal-api.example/v1/profiles/11111111-1111-4111-8111-111111111111?cursor=next_page', expect.objectContaining({cache: 'no-store'}))
    expect((await GET(new Request('https://web.example/api/social/profiles/11111111-1111-4111-8111-111111111111?cursor=one&cursor=two'), {params: Promise.resolve({path})})).status).toBe(400)
    expect((await GET(new Request('https://web.example/api/social/profiles/11111111-1111-4111-8111-111111111111?admin=true'), {params: Promise.resolve({path})})).status).toBe(400)
  })
  it('forwards authenticated owner collection reads without accepting extra query keys', async()=>{process.env.AIFANS_API_URL='https://internal-api.example';const upstream=vi.fn().mockImplementation(async()=>Response.json({items:[],nextCursor:null}));vi.stubGlobal('fetch',upstream);for(const collection of ['likes','bookmarks','following']){const response=await GET(new Request(`https://web.example/api/social/${collection}`),{params:Promise.resolve({path:[collection]})});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(upstream).toHaveBeenLastCalledWith(`https://internal-api.example/v1/${collection}`,expect.objectContaining({headers:{authorization:'Bearer signed-jwt'}}))}expect((await GET(new Request('https://web.example/api/social/likes?admin=true'),{params:Promise.resolve({path:['likes']})})).status).toBe(400)})
  it('does not force the owner-only cache policy onto public profile reads',async()=>{process.env.AIFANS_API_URL='https://internal-api.example';vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({profile:{},followerCount:0,posts:{items:[],nextCursor:null}})));const path=['profiles','11111111-1111-4111-8111-111111111111'];const response=await GET(new Request(`https://web.example/api/social/${path.join('/')}`),{params:Promise.resolve({path})});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).not.toBe('private, no-store')})
  it('strictly proxies a bounded public comment-thread context read', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    const commentId = '33333333-3333-4333-8333-333333333333'
    const comment = {id: commentId, postId, rootCommentId: commentId, parentCommentId: null, state: 'published', body: 'Context root', createdAt: '2026-09-03T08:00:00.000Z', likeCount: 0, replyCount: 0, bookmarkCount: 0, shareCount: 0, author: {kind: 'human', id: '44444444-4444-4444-8444-444444444444', username: 'alex', displayName: 'Alex'}}
    const upstream = vi.fn().mockResolvedValue(Response.json({group: {root: comment, replies: []}}))
    vi.stubGlobal('fetch', upstream)
    const path = ['posts', postId, 'comments', commentId, 'context']

    const response = await GET(new Request(`https://web.example/api/social/${path.join('/')}`), {params: Promise.resolve({path})})

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({group: {root: comment, replies: []}})
    expect(upstream).toHaveBeenCalledWith(`https://internal-api.example/v1/posts/${postId}/comments/${commentId}/context`, expect.objectContaining({cache: 'no-store'}))

    upstream.mockResolvedValueOnce(Response.json({group: {root: {id: commentId}, replies: []}}))
    expect((await GET(new Request(`https://web.example/api/social/${path.join('/')}`), {params: Promise.resolve({path})})).status).toBe(502)
  })
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

  it.each([
    ['PUT', 'like', {created: true}],
    ['DELETE', 'like', {deleted: true}],
    ['PUT', 'bookmark', {created: false}],
    ['DELETE', 'bookmark', {deleted: false}],
  ] as const)('allows the bounded comment %s %s mutation', async (method, action, payload) => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    const upstream = vi.fn().mockResolvedValue(Response.json(payload))
    vi.stubGlobal('fetch', upstream)
    const path = ['comments', postId, action]
    const request = new Request(`https://web.example/api/social/${path.join('/')}`, {method, headers: {origin: 'https://web.example'}})
    const response = method === 'PUT' ? await PUT(request, {params: Promise.resolve({path})}) : await DELETE(request, {params: Promise.resolve({path})})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(payload)
    expect(upstream).toHaveBeenCalledWith(`https://internal-api.example/v1/comments/${postId}/${action}`, expect.objectContaining({method}))
  })

  it('allows a strict empty-body comment share without leaking browser headers', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET = 's'.repeat(32)
    const upstream = vi.fn().mockResolvedValue(Response.json({created: true}))
    vi.stubGlobal('fetch', upstream)
    const path = ['comments', postId, 'share']
    const request = new Request(`https://web.example/api/social/${path.join('/')}`, {method: 'POST', headers: {origin: 'https://web.example', 'idempotency-key': postId, cookie: 'private=true'}})
    const response = await POST(request, {params: Promise.resolve({path})})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({created: true})
    const sent = new Headers((upstream.mock.calls[0]?.[1] as RequestInit).headers)
    expect(sent.has('cookie')).toBe(false)
    expect(sent.get('idempotency-key')).toBe(postId)
  })

  it('fails safely when the API is not configured', async () => {
    const request = new Request('https://web.example/api/social/profiles/11111111-1111-4111-8111-111111111111/follow', {method: 'PUT',headers:{origin:'https://web.example'}})
    const response = await PUT(request, {params: Promise.resolve({path: ['profiles', '11111111-1111-4111-8111-111111111111', 'follow']})})
    expect(response.status).toBe(503)
  })

  it('accepts only the strict comment request, returns only the strict created-comment DTO, and invalidates fixed feed tags', async () => {
    process.env.AIFANS_API_URL='https://internal-api.example'
    const created={id:'33333333-3333-4333-8333-333333333333',postId:'22222222-2222-4222-8222-222222222222',rootCommentId:'33333333-3333-4333-8333-333333333333',parentCommentId:null,state:'published',body:'hello',createdAt:'2026-09-02T12:00:00.000Z',likeCount:0,replyCount:0,bookmarkCount:0,shareCount:0,viewerHasLiked:false,viewerHasBookmarked:false,author:{kind:'human',id:'44444444-4444-4444-8444-444444444444',username:'alex',displayName:'Alex'}}
    const upstream=vi.fn().mockResolvedValue(new Response(JSON.stringify(created),{status:201,headers:{'content-type':'application/json'}}))
    vi.stubGlobal('fetch',upstream)
    const path=['posts','22222222-2222-4222-8222-222222222222','comments']
    const request=new Request('https://web.example/api/social/'+path.join('/'),{method:'POST',headers:{origin:'https://web.example','content-type':'application/json'},body:'{"body":"hello"}'})
    const response=await POST(request,{params:Promise.resolve({path})})
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual(created)
    expect(upstream).toHaveBeenCalledWith('https://internal-api.example/v1/'+path.join('/'),expect.objectContaining({method:'POST',body:'{"body":"hello"}'}))
    expect(revalidateTag).toHaveBeenCalledTimes(2)
    expect(revalidateTag).toHaveBeenCalledWith('feed:for_you:en','max')
    expect(revalidateTag).toHaveBeenCalledWith('feed:for_you:zh-CN','max')
    const expanded=new Request('https://web.example/api/social/'+path.join('/'),{method:'POST',headers:{origin:'https://web.example','content-type':'application/json'},body:'{"body":"hello","actor":"forged"}'})
    expect((await POST(expanded,{params:Promise.resolve({path})})).status).toBe(422)
    const duplicate=new Request('https://web.example/api/social/'+path.join('/'),{method:'POST',headers:{origin:'https://web.example','content-type':'application/json'},body:'{"body":"one","body":"two"}'})
    expect((await POST(duplicate,{params:Promise.resolve({path})})).status).toBe(422)
    const crossOrigin=new Request('https://web.example/api/social/'+path.join('/'),{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{"body":"hello"}'})
    expect((await POST(crossOrigin,{params:Promise.resolve({path})})).status).toBe(403)
  })

  it('does not invalidate or expose malformed successful comment payloads', async () => {
    process.env.AIFANS_API_URL='https://internal-api.example'
    const path=['posts','22222222-2222-4222-8222-222222222222','comments']
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'leak',internalToken:'secret'}),{status:201,headers:{'content-type':'application/json'}})))
    const request=new Request('https://web.example/api/social/'+path.join('/'),{method:'POST',headers:{origin:'https://web.example','content-type':'application/json'},body:'{"body":"hello"}'})
    const response=await POST(request,{params:Promise.resolve({path})})
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({code:'SOCIAL_INVALID_RESPONSE'})
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('rejects declared and streamed oversized comment bodies before upstream auth transport',async()=>{process.env.AIFANS_API_URL='https://internal-api.example';const upstream=vi.fn();vi.stubGlobal('fetch',upstream);const path=['posts','22222222-2222-4222-8222-222222222222','comments'];const url='https://web.example/api/social/'+path.join('/');for(const request of [new Request(url,{method:'POST',headers:{origin:'https://web.example','content-type':'application/json','content-length':'9000'},body:'{}'}),new Request(url,{method:'POST',headers:{origin:'https://web.example','content-type':'application/json'},body:JSON.stringify({body:'x'.repeat(9000)})})])expect((await POST(request,{params:Promise.resolve({path})})).status).toBe(413);expect(upstream).not.toHaveBeenCalled()})
  it('rejects every mutation query instead of silently dropping it',async()=>{process.env.AIFANS_API_URL='https://internal-api.example';const upstream=vi.fn();vi.stubGlobal('fetch',upstream);const path=['notifications','22222222-2222-4222-8222-222222222222','read'];const request=new Request('https://web.example/api/social/'+path.join('/')+'?actor=one&actor=two',{method:'PUT',headers:{origin:'https://web.example'}});expect((await PUT(request,{params:Promise.resolve({path})})).status).toBe(400);expect(upstream).not.toHaveBeenCalled()})
})
