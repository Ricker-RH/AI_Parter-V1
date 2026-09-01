import {createHmac} from 'node:crypto'
import {describe, expect, it, vi} from 'vitest'
import {createApp} from './application.js'
import type {RateLimitPort} from './ports/rate-limit.js'

describe('API production hardening', () => {
  const identitySecret = 'i'.repeat(32)
  const rateLimitSecret = 'r'.repeat(32)
  const identity = (minute: number, address = '203.0.113.7') => {
    const clientHash = createHmac('sha256', identitySecret).update(address).digest('hex')
    const unsigned = `v1.${minute}.${clientHash}`
    return `${unsigned}.${createHmac('sha256', identitySecret).update(unsigned).digest('hex')}`
  }

  it('fails closed for protected mutations when production rate limiting is unavailable', async () => {
    const response=await createApp({requireRateLimit:true}).request('/v1/chat/11111111-1111-4111-8111-111111111111/messages',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({code:'RATE_LIMIT_NOT_CONFIGURED'})
  })

  it('maps fixed endpoint families to fixed policies and returns Retry-After on denial', async () => {
    const consume=vi.fn(async()=>({allowed:false,retryAfterSeconds:17,remaining:0}))
    const rateLimit={consume} satisfies RateLimitPort
    const response=await createApp({requireRateLimit:true,rateLimit,rateLimitHmacSecret:rateLimitSecret,rateLimitIdentitySecret:identitySecret}).request('/v1/posts/11111111-1111-4111-8111-111111111111/comments',{method:'POST',headers:{'content-type':'application/json','x-aifans-rate-limit-identity':identity(Math.floor(Date.now()/60_000))},body:'{}'})
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('17')
    expect(consume).toHaveBeenCalledWith(expect.objectContaining({policy:'comment_create',identifierHash:expect.stringMatching(/^[a-f0-9]{64}$/)}))
    expect(JSON.stringify(consume.mock.calls)).not.toContain('203.0.113.7')
  })

  it('accepts only current signed mutation identities and never trusts forwarded client addresses', async () => {
    const consume = vi.fn(async()=>({allowed:true,retryAfterSeconds:0,remaining:1}))
    const app = createApp({requireRateLimit:true,rateLimit:{consume},rateLimitHmacSecret:rateLimitSecret,rateLimitIdentitySecret:identitySecret})
    const path = '/v1/chat/11111111-1111-4111-8111-111111111111/messages'
    const now = Math.floor(Date.now() / 60_000)
    const valid = await app.request(path, {method:'POST', headers:{'content-type':'application/json','x-aifans-rate-limit-identity':identity(now),'x-forwarded-for':'203.0.113.7'},body:'{}'})
    const missing = await app.request(path, {method:'POST', headers:{'content-type':'application/json','x-forwarded-for':'203.0.113.7'},body:'{}'})
    const expired = await app.request(path, {method:'POST', headers:{'content-type':'application/json','x-aifans-rate-limit-identity':identity(now - 2)},body:'{}'})
    const previous = await app.request(path, {method:'POST', headers:{'content-type':'application/json','x-aifans-rate-limit-identity':identity(now - 1)},body:'{}'})
    const signed = identity(now)
    const replacement = signed.endsWith('0') ? '1' : '0'
    const tampered = await app.request(path, {method:'POST', headers:{'content-type':'application/json','x-aifans-rate-limit-identity':`${signed.slice(0, -1)}${replacement}`},body:'{}'})
    expect(valid.status).not.toBe(503)
    expect(previous.status).not.toBe(503)
    expect((await missing.json()).code).toBe('RATE_LIMIT_IDENTITY_UNAVAILABLE')
    expect((await expired.json()).code).toBe('RATE_LIMIT_IDENTITY_UNAVAILABLE')
    expect((await tampered.json()).code).toBe('RATE_LIMIT_IDENTITY_UNAVAILABLE')
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
