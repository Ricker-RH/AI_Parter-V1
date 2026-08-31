import {afterEach, describe, expect, it, vi} from 'vitest'
vi.mock('../../../../../lib/auth/server.js', () => ({getApiBearerToken: vi.fn(async () => 'signed-jwt')}))
import * as route from './route.js'

const ipProfileId = '11111111-1111-4111-8111-111111111111'
const conversationId = '22222222-2222-4222-8222-222222222222'
const messageId = '33333333-3333-4333-8333-333333333333'
const answer = {answer: 'Hello back', conversationId, messageId, createdAt: '2026-09-01T01:00:00.000Z'}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.AIFANS_API_URL
})

function request(body: unknown, suffix = '') {
  return new Request(`https://web.example/api/chat/${ipProfileId}/messages${suffix}`, {
    method: 'POST',
    headers: {'content-type': 'application/json', cookie: 'session=real', 'x-request-id': 'req-chat'},
    body: JSON.stringify(body),
  })
}

describe('same-origin chat proxy', () => {
  it('forwards one strict message with bearer auth and request correlation', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example/'
    const upstream = vi.fn().mockResolvedValue(Response.json(answer, {status: 201, headers: {'x-request-id': 'upstream-chat'}}))
    vi.stubGlobal('fetch', upstream)
    const response = await route.POST(request({message: ' hello ', locale: 'en'}), {params: Promise.resolve({ipProfileId})})
    expect(response.status).toBe(201)
    expect(response.headers.get('x-request-id')).toBe('upstream-chat')
    expect(await response.json()).toEqual(answer)
    expect(upstream).toHaveBeenCalledWith(`https://internal-api.example/v1/chat/${ipProfileId}/messages`, {
      method: 'POST', cache: 'no-store',
      headers: {authorization: 'Bearer signed-jwt', 'content-type': 'application/json', 'x-request-id': 'req-chat'},
      body: JSON.stringify({message: 'hello', locale: 'en'}),
    })
  })

  it.each([
    [{message: 'hello', user: 'forged'}],
    [{message: '   '}],
    [{message: 'hello', conversationId: 'bad'}],
    [{message: 'hello', locale: 'fr'}],
  ])('rejects an invalid or expanded request body without upstream access', async (body) => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const response = await route.POST(request(body), {params: Promise.resolve({ipProfileId})})
    expect(response.status).toBe(422)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('rejects an invalid target, query string, and non-POST exports', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    expect((await route.POST(request({message: 'hi'}), {params: Promise.resolve({ipProfileId: 'not-a-uuid'})})).status).toBe(404)
    expect((await route.POST(request({message: 'hi'}, '?source=forged'), {params: Promise.resolve({ipProfileId})})).status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
    expect('GET' in route).toBe(false)
    expect('PUT' in route).toBe(false)
    expect('DELETE' in route).toBe(false)
  })

  it('returns a safe 503 without configuration or on network failure', async () => {
    expect((await route.POST(request({message: 'hi'}), {params: Promise.resolve({ipProfileId})})).status).toBe(503)
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private network detail')))
    const response = await route.POST(request({message: 'hi'}), {params: Promise.resolve({ipProfileId})})
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({code: 'CHAT_UNAVAILABLE'})
  })

  it('does not pass through a malformed successful provider response', async () => {
    process.env.AIFANS_API_URL = 'https://internal-api.example'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({answer: 'fake'}, {status: 201})))
    const response = await route.POST(request({message: 'hi'}), {params: Promise.resolve({ipProfileId})})
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({code: 'CHAT_INVALID_RESPONSE'})
  })
})
