import {describe, expect, it, vi} from 'vitest'
import {createApp} from './app.js'
import type {RateLimitPort} from './ports/rate-limit.js'

describe('API production hardening', () => {
  it('fails closed for protected mutations when production rate limiting is unavailable', async () => {
    const response=await createApp({requireRateLimit:true}).request('/v1/chat/11111111-1111-4111-8111-111111111111/messages',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({code:'RATE_LIMIT_NOT_CONFIGURED'})
  })

  it('maps fixed endpoint families to fixed policies and returns Retry-After on denial', async () => {
    const consume=vi.fn(async()=>({allowed:false,retryAfterSeconds:17,remaining:0}))
    const rateLimit={consume} satisfies RateLimitPort
    const response=await createApp({requireRateLimit:true,rateLimit,rateLimitHmacSecret:'s'.repeat(32)}).request('/v1/posts/11111111-1111-4111-8111-111111111111/comments',{method:'POST',headers:{'content-type':'application/json','x-vercel-forwarded-for':'203.0.113.7'},body:'{}'})
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('17')
    expect(consume).toHaveBeenCalledWith(expect.objectContaining({policy:'comment_create',identifierHash:expect.stringMatching(/^[a-f0-9]{64}$/)}))
    expect(JSON.stringify(consume.mock.calls)).not.toContain('203.0.113.7')
  })

  it('rejects declared and streamed bodies above the global limit before routes run', async () => {
    const rateLimit={consume:vi.fn(async()=>({allowed:true,retryAfterSeconds:0,remaining:1}))} satisfies RateLimitPort
    const app=createApp({rateLimit,rateLimitHmacSecret:'s'.repeat(32)})
    const declared=await app.request('/v1/chat/11111111-1111-4111-8111-111111111111/messages',{method:'POST',headers:{'content-type':'application/json','content-length':'65537'},body:'{}'})
    const streamed=await app.request('/v1/chat/11111111-1111-4111-8111-111111111111/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'x'.repeat(66_000)})})
    expect(declared.status).toBe(413)
    expect(streamed.status).toBe(413)
  })

  it('emits redacted structured request records without body, query, auth, cookie, or raw IP', async () => {
    const info=vi.fn(); const error=vi.fn()
    const response=await createApp({logger:{info,error}}).request('/health?token=leak',{headers:{authorization:'Bearer secret-token',cookie:'session=secret','x-forwarded-for':'203.0.113.8'}})
    expect(response.status).toBe(200)
    expect(info).toHaveBeenCalledWith(expect.objectContaining({event:'http_request',method:'GET',route:'/health',status:200,requestId:expect.any(String),durationMs:expect.any(Number)}))
    const serialized=JSON.stringify(info.mock.calls)
    for(const secret of ['token=leak','secret-token','session=secret','203.0.113.8']) expect(serialized).not.toContain(secret)
    expect(error).not.toHaveBeenCalled()
  })

  it('returns only bounded readiness state for success, failure, and missing dependencies', async () => {
    expect(await (await createApp({readiness:{check:async()=>true}}).request('/health/ready')).json()).toEqual({status:'ok'})
    const unavailable=await createApp({readiness:{check:async()=>{throw new Error('postgresql://owner:secret@host/db')}}}).request('/health/ready')
    expect(unavailable.status).toBe(503)
    expect(await unavailable.json()).toEqual({status:'unavailable'})
    expect((await createApp().request('/health/ready')).status).toBe(503)
  })
})
