import {afterEach, describe, expect, it, vi} from 'vitest'
vi.mock('../../../../lib/auth/server.js', () => ({getApiBearerToken: vi.fn(async () => 'creator-jwt')}))
import * as route from './route.js'

const id = '11111111-1111-4111-8111-111111111111'

afterEach(() => { vi.unstubAllGlobals(); delete process.env.AIFANS_API_URL; delete process.env.CREATOR_MODE_ENABLED; delete process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET })

function request(path: string, method: string, body?: object) {
  return new Request(`https://web.example/api/creator/${path}`, {
    method,
    headers: {'content-type': 'application/json', origin: 'https://web.example', cookie: 'session=secret', 'x-request-id': 'web-request'},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  })
}

describe('same-origin creator proxy', () => {
  it.each([
    ['GET', 'drafts', `/v1/creator/drafts`],
    ['GET', `drafts/${id}`, `/v1/creator/drafts/${id}`],
    ['POST', 'drafts', `/v1/creator/drafts`],
    ['PATCH', `drafts/${id}`, `/v1/creator/drafts/${id}`],
    ['DELETE', `drafts/${id}`, `/v1/creator/drafts/${id}`],
    ['POST', `drafts/${id}/references/upload-intent`, `/v1/creator/drafts/${id}/references/upload-intent`],
    ['POST', `drafts/${id}/references`, `/v1/creator/drafts/${id}/references`],
    ['GET', `drafts/${id}/references/${id}/read-intent`, `/v1/creator/drafts/${id}/references/${id}/read-intent`],
    ['POST', `drafts/${id}/submit`, `/v1/creator/drafts/${id}/submit`],
    ['POST', `drafts/${id}/generation-intent`, `/v1/creator/drafts/${id}/generation-intent`],
    ['GET', `ips/${id}/analytics`, `/v1/creator/ips/${id}/analytics`],
    ['POST', `ips/${id}/requests`, `/v1/creator/ips/${id}/requests`],
    ['GET', 'admin/submissions', `/v1/admin/creator/submissions`],
    ['GET', `admin/submissions/${id}`, `/v1/admin/creator/submissions/${id}`],
    ['POST', `admin/submissions/${id}/decision`, `/v1/admin/creator/submissions/${id}/decision`],
    ['GET', 'admin/requests', `/v1/admin/creator/requests`],
    ['POST', `admin/requests/${id}/decision`, `/v1/admin/creator/requests/${id}/decision`],
  ])('allows only %s /%s', async (method, path, upstreamPath) => {
    process.env.AIFANS_API_URL='https://api.internal'
    const upstream=vi.fn().mockResolvedValue(Response.json({items:[],nextCursor:null},{headers:{'x-request-id':'upstream-id'}}))
    vi.stubGlobal('fetch',upstream)
    const handler=route[method as keyof typeof route] as (request:Request,context:{params:Promise<{path:string[]}>})=>Promise<Response>
    const response=await handler(request(path,method,method==='POST'||method==='PATCH'?{}:undefined),{params:Promise.resolve({path:path.split('/')})})
    expect(response.status).toBe(200)
    const [url,init]=upstream.mock.calls[0] as unknown as [string,RequestInit]
    expect(url).toBe(`https://api.internal${upstreamPath}`)
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer creator-jwt')
    expect(new Headers(init.headers).get('cookie')).toBeNull()
    expect(response.headers.get('x-request-id')).toBe('upstream-id')
  })

  it.each([
    'drafts',
    `drafts/${id}`,
    `drafts/${id}/references/${id}/read-intent`,
    'submissions',
    `submissions/${id}`,
    'ips',
    `ips/${id}`,
    `ips/${id}/analytics`,
    'requests',
    `requests/${id}`,
    'admin/submissions',
    `admin/submissions/${id}`,
    'admin/requests',
  ])('prevents private creator GET /%s responses from being cached', async path => {
    process.env.AIFANS_API_URL='https://api.internal'
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({items:[]})))

    const response=await route.GET(request(path,'GET'),{params:Promise.resolve({path:path.split('/')})})

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('does not apply the private no-store policy to public profile GET responses',async()=>{
    process.env.AIFANS_API_URL='https://api.internal'
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({id})))

    const response=await route.GET(request(`public/profiles/${id}`,'GET'),{params:Promise.resolve({path:['public','profiles',id]})})

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBeNull()
  })

  it('rejects unknown paths, queries, cross-origin mutations, duplicate JSON, and oversized bodies', async () => {
    process.env.AIFANS_API_URL='https://api.internal'; const upstream=vi.fn(); vi.stubGlobal('fetch',upstream)
    expect((await route.GET(request('drafts/extra/path','GET'),{params:Promise.resolve({path:['drafts','extra','path']})})).status).toBe(404)
    const query=new Request('https://web.example/api/creator/drafts?operator=true'); expect((await route.GET(query,{params:Promise.resolve({path:['drafts']})})).status).toBe(404)
    const cross=request('drafts','POST',{}); cross.headers.set('origin','https://evil.example'); expect((await route.POST(cross,{params:Promise.resolve({path:['drafts']})})).status).toBe(403)
    const duplicate=new Request('https://web.example/api/creator/drafts',{method:'POST',headers:{origin:'https://web.example','content-type':'application/json'},body:'{"username":"a","username":"b"}'})
    expect((await route.POST(duplicate,{params:Promise.resolve({path:['drafts']})})).status).toBe(422)
    const large=request('drafts','POST',{}); large.headers.set('content-length','70000'); expect((await route.POST(large,{params:Promise.resolve({path:['drafts']})})).status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('creates a trusted identity for mutations without forwarding browser credentials or forged identity headers', async () => {
    process.env.AIFANS_API_URL='https://api.internal'; process.env.WEB_API_RATE_LIMIT_SIGNING_SECRET='s'.repeat(32)
    const upstream=vi.fn().mockResolvedValue(Response.json({ok:true})); vi.stubGlobal('fetch',upstream)
    const input=request('drafts','POST',{}); input.headers.set('authorization','Bearer forged'); input.headers.set('x-aifans-rate-limit-identity','forged'); input.headers.set('x-vercel-forwarded-for','203.0.113.7, 10.0.0.1')
    await route.POST(input,{params:Promise.resolve({path:['drafts']})})
    const headers=new Headers((upstream.mock.calls[0]?.[1] as RequestInit).headers)
    expect(headers.get('x-aifans-rate-limit-identity')).toMatch(/^v1\.\d+\.[a-f0-9]{64}\.[a-f0-9]{64}$/)
    expect(headers.get('authorization')).toBe('Bearer creator-jwt')
    for(const name of ['cookie','x-vercel-forwarded-for'])expect(headers.has(name)).toBe(false)
  })

  it('rejects nested duplicate JSON keys at every object depth',async()=>{
    process.env.AIFANS_API_URL='https://api.internal';const upstream=vi.fn();vi.stubGlobal('fetch',upstream)
    const duplicate=new Request('https://web.example/api/creator/drafts',{method:'POST',headers:{origin:'https://web.example','content-type':'application/json'},body:'{"persona":{"tone":"warm","tone":"cold"}}'})
    expect((await route.POST(duplicate,{params:Promise.resolve({path:['drafts']})})).status).toBe(422)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('returns not found for creator and admin creator routes when creator mode is disabled',async()=>{
    process.env.CREATOR_MODE_ENABLED='false';process.env.AIFANS_API_URL='https://api.internal';const upstream=vi.fn();vi.stubGlobal('fetch',upstream)
    expect((await route.GET(request('drafts','GET'),{params:Promise.resolve({path:['drafts']})})).status).toBe(404)
    expect((await route.GET(request('admin/submissions','GET'),{params:Promise.resolve({path:['admin','submissions']})})).status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('accepts the browser origin matching the forwarded Host even when the runtime request URL is internal',async()=>{
    process.env.AIFANS_API_URL='https://api.internal';const upstream=vi.fn().mockResolvedValue(Response.json({ok:true}));vi.stubGlobal('fetch',upstream)
    const forwarded=new Request('http://localhost:3000/api/creator/drafts',{method:'POST',headers:{host:'web.example',origin:'http://web.example','content-type':'application/json'},body:'{}'})
    expect((await route.POST(forwarded,{params:Promise.resolve({path:['drafts']})})).status).toBe(200)
    expect(upstream).toHaveBeenCalledOnce()
  })
})
