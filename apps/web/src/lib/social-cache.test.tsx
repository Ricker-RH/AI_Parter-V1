import {beforeEach, describe, expect, it, vi} from 'vitest'

const {cacheLife, cacheTag, fetchAifansApi} = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  fetchAifansApi: vi.fn(),
}))
vi.mock('next/cache', () => ({cacheLife, cacheTag}))
vi.mock('./server-api.js', () => ({fetchAifansApi}))

import {fetchCachedPublicFeed, publicFeedTag} from './social-cache.js'

const cachedPost = {
  id: '22222222-2222-4222-8222-222222222222',
  body: 'Cached post',
  languageCode: 'en',
  publishedAt: '2026-08-31T12:00:00.000Z',
  author: {
    kind: 'ip' as const,
    id: '11111111-1111-4111-8111-111111111111',
    username: 'luma',
    displayName: 'Luma',
    languages: ['en'] as const,
    visualType: 'hybrid' as const,
  },
  likeCount: 4,
  commentCount: 2,
}

describe('public social cache', () => {
  beforeEach(() => {
    cacheLife.mockReset()
    cacheTag.mockReset()
    fetchAifansApi.mockReset().mockResolvedValue(Response.json({items: [], nextCursor: null}))
  })

  it('keys anonymous feed lifetime and invalidation metadata by locale and kind', async () => {
    await expect(fetchCachedPublicFeed({kind: 'for_you', locale: 'zh-CN'})).resolves.toEqual({items: [], nextCursor: null})

    expect(cacheLife).toHaveBeenCalledWith({stale: 30, revalidate: 60, expire: 3600})
    expect(cacheTag).toHaveBeenCalledWith('feed:for_you:zh-CN')
    expect(publicFeedTag('en', 'for_you')).toBe('feed:for_you:en')
    expect(fetchAifansApi).toHaveBeenCalledWith('/v1/feed?kind=for_you&locale=zh-CN', {policy: 'public-cache'})
  })

  it('includes the opaque cursor in the cached request without putting it in the shared tag', async () => {
    await fetchCachedPublicFeed({kind: 'for_you', locale: 'en', cursor: 'next page'})

    expect(cacheTag).toHaveBeenCalledWith('feed:for_you:en')
    expect(fetchAifansApi).toHaveBeenCalledWith('/v1/feed?kind=for_you&locale=en&cursor=next+page', {policy: 'public-cache'})
  })

  it.each([
    ['an old payload without followerCount', cachedPost],
    ['a new payload with followerCount', {...cachedPost, author: {...cachedPost.author, followerCount: 7}}],
  ])('replays %s through the public cache contract', async (_description, post) => {
    fetchAifansApi.mockResolvedValue(Response.json({items: [post], nextCursor: null}))

    await expect(fetchCachedPublicFeed({kind: 'for_you', locale: 'en'})).resolves.toEqual({items: [post], nextCursor: null})
  })

  it.each([401, 429, 503])('rejects a %s response instead of caching a transient failure', async (status) => {
    fetchAifansApi.mockResolvedValue(new Response(JSON.stringify({code: 'UPSTREAM_ERROR'}), {status}))

    await expect(fetchCachedPublicFeed({kind: 'for_you', locale: 'en'})).rejects.toThrow('Public feed unavailable')
  })

  it('rejects invalid JSON instead of caching it', async () => {
    fetchAifansApi.mockResolvedValue(new Response('not json', {status: 200}))

    await expect(fetchCachedPublicFeed({kind: 'for_you', locale: 'en'})).rejects.toThrow()
  })

  it('rejects a schema-invalid 2xx payload instead of caching it', async () => {
    fetchAifansApi.mockResolvedValue(Response.json({items: [], nextCursor: null, viewerToken: 'must-not-cache'}))

    await expect(fetchCachedPublicFeed({kind: 'for_you', locale: 'en'})).rejects.toThrow()
  })
})
