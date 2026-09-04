import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {fetchAifansApi} = vi.hoisted(() => ({fetchAifansApi: vi.fn()}))
vi.mock('../../../../lib/server-api.js', () => ({fetchAifansApi}))

import * as confirmRoute from './[assetId]/confirm/route.js'
import * as intentRoute from './upload-intent/route.js'

const assetId = '361967d8-e74f-4f6a-a6b7-ff29656de9f4'
const intent = {
  assetId,
  method: 'PUT' as const,
  url: 'https://uploads.example.com/profile',
  headers: {'content-type': 'image/webp'},
  expiresAt: '2026-09-04T12:00:00.000Z',
  maxBytes: 10_485_760,
}
const intentBody = {role: 'avatar', contentType: 'image/webp', sizeBytes: 1200, width: 512, height: 512}

function post(url: string, body: string = JSON.stringify(intentBody), headers: HeadersInit = {}) {
  return new Request(url, {
    method: 'POST',
    headers: {origin: 'https://web.example', 'content-type': 'application/json', cookie: 'session=secret', 'x-request-id': 'browser-request', ...headers},
    body,
  })
}

beforeEach(() => fetchAifansApi.mockReset())
afterEach(() => vi.unstubAllGlobals())

describe('profile asset browser proxy', () => {
  it('exposes only POST handlers', () => {
    expect(Object.keys(intentRoute).filter((key) => /^[A-Z]+$/.test(key))).toEqual(['POST'])
    expect(Object.keys(confirmRoute).filter((key) => /^[A-Z]+$/.test(key))).toEqual(['POST'])
  })

  it('forwards a strict upload intent with live authentication and no-store response headers', async () => {
    fetchAifansApi.mockResolvedValue(new Response(JSON.stringify(intent), {
      status: 201,
      headers: {'content-type': 'application/json; charset=utf-8', 'x-request-id': 'upstream-request'},
    }))
    const request = post('https://web.example/api/me/assets/upload-intent')

    const response = await intentRoute.POST(request)

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual(intent)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('x-request-id')).toBe('upstream-request')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fetchAifansApi).toHaveBeenCalledWith('/v1/me/assets/upload-intent', {
      policy: 'live-no-store',
      requestInit: {method: 'POST', headers: request.headers, body: JSON.stringify(intentBody), signal: request.signal},
      trustedClientHeaders: request.headers,
    })
  })

  it('forwards confirmation only when the strict body matches the path asset ID', async () => {
    fetchAifansApi.mockResolvedValue(new Response(JSON.stringify({assetId, role: 'avatar'}), {
      status: 200,
      headers: {'content-type': 'application/json', 'x-request-id': 'confirmed-request'},
    }))
    const request = post(`https://web.example/api/me/assets/${assetId}/confirm`, JSON.stringify({assetId}))

    const response = await confirmRoute.POST(request, {params: Promise.resolve({assetId})})

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({assetId, role: 'avatar'})
    expect(response.headers.get('x-request-id')).toBe('confirmed-request')
    expect(fetchAifansApi).toHaveBeenCalledWith(`/v1/me/assets/${assetId}/confirm`, expect.objectContaining({
      policy: 'live-no-store',
      requestInit: expect.objectContaining({method: 'POST', body: JSON.stringify({assetId})}),
    }))
  })

  it.each([
    ['missing origin', post('https://web.example/api/me/assets/upload-intent', undefined, {origin: ''}), 403],
    ['cross origin', post('https://web.example/api/me/assets/upload-intent', undefined, {origin: 'https://evil.example'}), 403],
    ['query string', post('https://web.example/api/me/assets/upload-intent?role=avatar'), 400],
    ['wrong MIME', post('https://web.example/api/me/assets/upload-intent', undefined, {'content-type': 'application/json-evil'}), 422],
    ['empty body', post('https://web.example/api/me/assets/upload-intent', ' '), 422],
    ['malformed JSON', post('https://web.example/api/me/assets/upload-intent', '{'), 422],
    ['duplicate key', post('https://web.example/api/me/assets/upload-intent', '{"role":"avatar","role":"background"}'), 422],
    ['unknown field', post('https://web.example/api/me/assets/upload-intent', JSON.stringify({...intentBody, objectKey: 'private/key'})), 422],
    ['declared oversized body', post('https://web.example/api/me/assets/upload-intent', '{}', {'content-length': '65537'}), 413],
  ])('rejects %s before upstream access', async (_label, request, status) => {
    const response = await intentRoute.POST(request)
    expect(response.status).toBe(status)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fetchAifansApi).not.toHaveBeenCalled()
  })

  it('bounds the streamed body at 65,536 bytes', async () => {
    const response = await intentRoute.POST(post('https://web.example/api/me/assets/upload-intent', 'x'.repeat(65_537)))
    expect(response.status).toBe(413)
    expect(fetchAifansApi).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed path ID', 'not-a-uuid', {assetId}, 400],
    ['query string', assetId, {assetId}, 400],
    ['mismatched body ID', assetId, {assetId: '11111111-1111-4111-8111-111111111111'}, 422],
    ['private object key', assetId, {assetId, objectKey: 'private/key'}, 422],
  ])('rejects confirmation with %s', async (label, pathId, body, status) => {
    const query = label === 'query string' ? '?forged=1' : ''
    const response = await confirmRoute.POST(
      post(`https://web.example/api/me/assets/${pathId}/confirm${query}`, JSON.stringify(body)),
      {params: Promise.resolve({assetId: pathId})},
    )
    expect(response.status).toBe(status)
    expect(fetchAifansApi).not.toHaveBeenCalled()
  })

  it('does not expose undeclared upstream object keys', async () => {
    fetchAifansApi.mockResolvedValue(Response.json({...intent, objectKey: 'private/profiles/key'}, {status: 201}))

    const response = await intentRoute.POST(post('https://web.example/api/me/assets/upload-intent'))

    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toContain('objectKey')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
