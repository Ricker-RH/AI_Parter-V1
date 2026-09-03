import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {request} = vi.hoisted(() => ({request: vi.fn()}))
vi.mock('./server-api.js', () => ({fetchAifansApi: request}))

import {fetchChannel, fetchChannelIps, fetchChannelPosts, fetchChannels} from './channels-api.js'

const channel = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'future-city',
  name: 'Future City',
  description: 'Urban futures',
  imageUrl: null,
  ipCount: 3,
}
const ip = {
  kind: 'ip' as const,
  id: '22222222-2222-4222-8222-222222222222',
  username: 'luma',
  displayName: 'Luma',
  languages: ['en'],
  visualType: 'realistic' as const,
}

describe('channels API', () => {
  beforeEach(() => request.mockReset())
  afterEach(() => vi.unstubAllGlobals())

  it('encodes a bounded server-authoritative directory query using the public cache', async () => {
    request.mockResolvedValue(Response.json({items: [channel], nextCursor: 'next'}))

    await expect(fetchChannels({q: '未来 城市', cursor: 'page/2', limit: 12})).resolves.toEqual({status: 'ok', data: {items: [channel], nextCursor: 'next'}})

    expect(request).toHaveBeenCalledWith('/v1/channels?q=%E6%9C%AA%E6%9D%A5+%E5%9F%8E%E5%B8%82&limit=12&cursor=page%2F2', {policy: 'public-cache'})
  })

  it('uses an explicit server token for private post hydration and validates every response', async () => {
    request
      .mockResolvedValueOnce(Response.json({...channel, recommendedIps: [ip]}))
      .mockResolvedValueOnce(Response.json({items: [ip], nextCursor: null}))
      .mockResolvedValueOnce(Response.json({items: [], nextCursor: null}))

    await expect(fetchChannel('future-city')).resolves.toMatchObject({status: 'ok'})
    await expect(fetchChannelIps('future-city', {cursor: 'ip-next', limit: 25})).resolves.toMatchObject({status: 'ok'})
    await expect(fetchChannelPosts('future-city', {cursor: 'post-next', token: 'viewer-jwt'})).resolves.toEqual({status: 'ok', data: {items: [], nextCursor: null}})

    expect(request).toHaveBeenNthCalledWith(1, '/v1/channels/future-city', {policy: 'public-cache'})
    expect(request).toHaveBeenNthCalledWith(2, '/v1/channels/future-city/profiles?limit=25&cursor=ip-next', {policy: 'public-cache'})
    expect(request).toHaveBeenNthCalledWith(3, '/v1/channels/future-city/posts?cursor=post-next', {policy: 'private-cache', getToken: expect.any(Function)})
    const tokenProvider = request.mock.calls[2]?.[1]?.getToken as (() => Promise<string>) | undefined
    await expect(tokenProvider?.()).resolves.toBe('viewer-jwt')
  })

  it('maps missing/archived channels and malformed or failed reads without leaking errors', async () => {
    request
      .mockResolvedValueOnce(Response.json({code: 'CHANNEL_NOT_FOUND'}, {status: 404}))
      .mockResolvedValueOnce(Response.json({items: [{...channel, extra: true}], nextCursor: null}))
      .mockRejectedValueOnce(new Error('private upstream detail'))

    await expect(fetchChannel('archived')).resolves.toEqual({status: 'not-found'})
    await expect(fetchChannels({})).resolves.toEqual({status: 'unavailable'})
    await expect(fetchChannelIps('future-city')).resolves.toEqual({status: 'unavailable'})
  })

  it('rejects invalid client-side limits before contacting the server', async () => {
    await expect(fetchChannels({limit: 51})).resolves.toEqual({status: 'unavailable'})
    await expect(fetchChannelIps('future-city', {limit: 0})).resolves.toEqual({status: 'unavailable'})
    expect(request).not.toHaveBeenCalled()
  })
})
