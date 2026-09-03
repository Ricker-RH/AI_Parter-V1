import {createHmac} from 'node:crypto'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createApp} from './application.js'
import type {RateLimitPort} from './ports/rate-limit.js'

describe('API production hardening', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())
  const identitySecret = 'i'.repeat(32)
  const rateLimitSecret = 'r'.repeat(32)
  const identity = (minute: number, address = '203.0.113.7') => {
    const clientHash = createHmac('sha256', identitySecret).update(address).digest('hex')
    const unsigned = `v1.${minute}.${clientHash}`
    return `${unsigned}.${createHmac('sha256', identitySecret).update(unsigned).digest('hex')}`
  }

  it('fails closed for protected mutations when production rate limiting is unavailable', async () => {
    const response=await createApp({requireRateLimit:true}).request('/v1/chat/conversations/11111111-1111-4111-8111-111111111111/messages',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})
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

  it('rate limits authenticated following reads before the route executes', async () => {
    const consume=vi.fn(async()=>({allowed:false,retryAfterSeconds:23,remaining:0}))
    const app=createApp({requireRateLimit:true,rateLimit:{consume},rateLimitHmacSecret:rateLimitSecret,rateLimitIdentitySecret:identitySecret})

    const response=await app.request('/v1/following',{headers:{'x-aifans-rate-limit-identity':identity(Math.floor(Date.now()/60_000))}})

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('23')
    expect(await response.json()).toMatchObject({code:'RATE_LIMITED'})
    expect(consume).toHaveBeenCalledOnce()
    expect(consume).toHaveBeenCalledWith({policy:'social_mutation',identifierHash:expect.stringMatching(/^[a-f0-9]{64}$/)})
  })

  it('rate limits share recording by signed client identity without using request data as identity', async () => {
    const consume=vi.fn(async()=>({allowed:true,retryAfterSeconds:0,remaining:1}))
    const app=createApp({requireRateLimit:true,rateLimit:{consume},rateLimitHmacSecret:rateLimitSecret,rateLimitIdentitySecret:identitySecret})
    const now=Math.floor(Date.now()/60_000)
    const key='11111111-1111-4111-8111-111111111112'
    const path='/v1/posts/11111111-1111-4111-8111-111111111111/share'
    const valid=await app.request(path,{method:'POST',headers:{'content-type':'application/json','idempotency-key':key,'x-aifans-rate-limit-identity':identity(now),'x-forwarded-for':'203.0.113.7'},body:'{}'})
    const missing=await app.request(path,{method:'POST',headers:{'idempotency-key':key}})
    const signed=identity(now)
    const replacement=signed.endsWith('0')?'1':'0'
    const forged=await app.request(path,{method:'POST',headers:{'idempotency-key':key,'x-aifans-rate-limit-identity':`${signed.slice(0,-1)}${replacement}`}})

    expect((await valid.json()).code).toBe('SOCIAL_NOT_CONFIGURED')
    expect((await missing.json()).code).toBe('RATE_LIMIT_IDENTITY_UNAVAILABLE')
    expect((await forged.json()).code).toBe('RATE_LIMIT_IDENTITY_UNAVAILABLE')
    expect(consume).toHaveBeenCalledOnce()
    expect(consume).toHaveBeenCalledWith({policy:'social_mutation',identifierHash:expect.stringMatching(/^[a-f0-9]{64}$/)})
    const serialized=JSON.stringify(consume.mock.calls)
    for(const value of [key,'203.0.113.7','{}']) expect(serialized).not.toContain(value)
  })

  it('accepts only current signed mutation identities and never trusts forwarded client addresses', async () => {
    const consume = vi.fn(async()=>({allowed:true,retryAfterSeconds:0,remaining:1}))
    const app = createApp({requireRateLimit:true,rateLimit:{consume},rateLimitHmacSecret:rateLimitSecret,rateLimitIdentitySecret:identitySecret})
    const path = '/v1/chat/conversations/11111111-1111-4111-8111-111111111111/messages'
    const now = Math.floor(Date.now() / 60_000)
    const valid = await app.request(path, {method:'POST', headers:{'content-type':'application/json','x-aifans-rate-limit-identity':identity(now),'x-forwarded-for':'203.0.113.7'},body:'{}'})
    const missing = await app.request(path, {method:'POST', headers:{'content-type':'application/json','x-forwarded-for':'203.0.113.7'},body:'{}'})
    const expired = await app.request(path, {method:'POST', headers:{'content-type':'application/json','x-aifans-rate-limit-identity':identity(now - 2)},body:'{}'})
    const previous = await app.request(path, {method:'POST', headers:{'content-type':'application/json','x-aifans-rate-limit-identity':identity(now - 1)},body:'{}'})
    const future = await app.request(path, {method:'POST', headers:{'content-type':'application/json','x-aifans-rate-limit-identity':identity(now + 1)},body:'{}'})
    const malformed = await app.request(path, {method:'POST', headers:{'content-type':'application/json','x-aifans-rate-limit-identity':'v1.not-a-minute.not-a-hash.not-a-signature'},body:'{}'})
    const signed = identity(now)
    const replacement = signed.endsWith('0') ? '1' : '0'
    const tampered = await app.request(path, {method:'POST', headers:{'content-type':'application/json','x-aifans-rate-limit-identity':`${signed.slice(0, -1)}${replacement}`},body:'{}'})
    expect((await valid.json()).code).toBe('AUTH_NOT_CONFIGURED')
    expect((await previous.json()).code).toBe('AUTH_NOT_CONFIGURED')
    expect(consume).toHaveBeenNthCalledWith(2, {policy:'chat_send', identifierHash:expect.stringMatching(/^[a-f0-9]{64}$/)})
    expect((await missing.json()).code).toBe('RATE_LIMIT_IDENTITY_UNAVAILABLE')
    expect((await expired.json()).code).toBe('RATE_LIMIT_IDENTITY_UNAVAILABLE')
    expect((await future.json()).code).toBe('RATE_LIMIT_IDENTITY_UNAVAILABLE')
    expect((await malformed.json()).code).toBe('RATE_LIMIT_IDENTITY_UNAVAILABLE')
    expect((await tampered.json()).code).toBe('RATE_LIMIT_IDENTITY_UNAVAILABLE')
    expect(JSON.stringify(consume.mock.calls)).not.toContain('203.0.113.7')
  })

  it('rate limits both persistent chat mutations but not the removed legacy path', async () => {
    const consume=vi.fn(async()=>({allowed:true,retryAfterSeconds:0,remaining:1}))
    const app=createApp({rateLimit:{consume},rateLimitHmacSecret:rateLimitSecret,rateLimitIdentitySecret:identitySecret})
    const headers={'content-type':'application/json','x-aifans-rate-limit-identity':identity(Math.floor(Date.now()/60_000))}
    await app.request('/v1/chat/conversations',{method:'POST',headers,body:'{}'})
    await app.request('/v1/chat/conversations/11111111-1111-4111-8111-111111111111/messages',{method:'POST',headers,body:'{}'})
    await app.request('/v1/chat/11111111-1111-4111-8111-111111111111/messages',{method:'POST',headers,body:'{}'})
    expect(consume).toHaveBeenCalledTimes(2)
    expect(consume).toHaveBeenNthCalledWith(1,expect.objectContaining({policy:'chat_send'}))
    expect(consume).toHaveBeenNthCalledWith(2,expect.objectContaining({policy:'chat_send'}))
  })

  it('rejects declared and streamed bodies above the global limit before routes run', async () => {
    const rateLimit={consume:vi.fn(async()=>({allowed:true,retryAfterSeconds:0,remaining:1}))} satisfies RateLimitPort
    const app=createApp({rateLimit,rateLimitHmacSecret:'s'.repeat(32)})
    const declared=await app.request('/v1/chat/conversations/11111111-1111-4111-8111-111111111111/messages',{method:'POST',headers:{'content-type':'application/json','content-length':'65537'},body:'{}'})
    const streamed=await app.request('/v1/chat/conversations/11111111-1111-4111-8111-111111111111/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'x'.repeat(66_000)})})
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
