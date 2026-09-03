import {afterEach, describe, expect, it, vi} from 'vitest'
const {getApiBearerToken, fetchCachedPublicFeed}=vi.hoisted(()=>({getApiBearerToken:vi.fn(async()=> 'signed-jwt'),fetchCachedPublicFeed:vi.fn()}))
vi.mock('./auth/server.js', () => ({getApiBearerToken}))
vi.mock('./social-cache.js', () => ({fetchCachedPublicFeed}))
import {
  fetchBookmarks,
  fetchLiked,
  fetchFeed,
  fetchNotifications,
  fetchPost,
  fetchPublicProfile,
} from './social-api.js'

const ip = {
  kind: 'ip' as const,
  id: '11111111-1111-4111-8111-111111111111',
  username: 'luma',
  displayName: 'Luma',
  languages: ['en'] as const,
  visualType: 'hybrid' as const,
}
const post = {
  id: '22222222-2222-4222-8222-222222222222',
  body: 'A real post',
  languageCode: 'en',
  publishedAt: '2026-08-31T12:00:00.000Z',
  author: ip,
  likeCount: 4,
  commentCount: 2,
  bookmarkCount: 1,
  shareCount: 3,
}

afterEach(() => {
  vi.unstubAllGlobals()
  getApiBearerToken.mockClear()
  fetchCachedPublicFeed.mockReset()
  delete process.env.AIFANS_API_URL
  delete process.env.NEXT_PUBLIC_AIFANS_API_URL
})

describe('social API client', () => {
  it('uses the server URL, forwards a bearer token, and strictly parses a feed', async () => {
    process.env.AIFANS_API_URL = 'https://server.example/'
    process.env.NEXT_PUBLIC_AIFANS_API_URL = 'https://public.example'
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({items: [post], nextCursor: null}), {status: 200}))
    vi.stubGlobal('fetch', request)

    const result = await fetchFeed({kind: 'following', locale: 'en', cookie: 'session=real', cursor: 'next page'})

    expect(result).toEqual({status: 'ok', data: {items: [post], nextCursor: null}})
    expect(request).toHaveBeenCalledWith(
      'https://server.example/v1/feed?kind=following&locale=en&cursor=next+page',
      expect.objectContaining({cache: 'no-store', headers: {authorization: 'Bearer signed-jwt'}}),
    )
  })

  it('uses the tagged public cache only for anonymous For You reads', async () => {
    fetchCachedPublicFeed.mockResolvedValue({items: [post], nextCursor: null})

    await expect(fetchFeed({kind: 'for_you', locale: 'zh-CN'})).resolves.toEqual({status: 'ok', data: {items: [post], nextCursor: null}})

    expect(fetchCachedPublicFeed).toHaveBeenCalledWith({kind: 'for_you', locale: 'zh-CN'})
    expect(getApiBearerToken).not.toHaveBeenCalled()
  })

  it('keeps authenticated For You and Following reads private and request-scoped', async () => {
    process.env.AIFANS_API_URL = 'https://server.example'
    const request = vi.fn().mockResolvedValue(Response.json({items: [post], nextCursor: null}))
    vi.stubGlobal('fetch', request)

    await fetchFeed({kind: 'for_you', locale: 'en', token: 'viewer-jwt'})
    await fetchFeed({kind: 'following', locale: 'en', token: 'viewer-jwt'})

    expect(fetchCachedPublicFeed).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(2)
    for (const [, init] of request.mock.calls) expect(init).toEqual(expect.objectContaining({cache: 'no-store', headers: {authorization: 'Bearer viewer-jwt'}}))
  })

  it('reuses a protected page token instead of requesting another token', async () => {
    process.env.AIFANS_API_URL = 'https://server.example'
    const request = vi.fn().mockResolvedValue(Response.json({items: [post], nextCursor: null}))
    vi.stubGlobal('fetch', request)

    await expect(fetchFeed({kind: 'following', locale: 'en', token: 'guarded-jwt'})).resolves.toMatchObject({status: 'ok'})

    expect(request).toHaveBeenCalledWith('https://server.example/v1/feed?kind=following&locale=en', expect.objectContaining({headers: {authorization: 'Bearer guarded-jwt'}}))
    expect(getApiBearerToken).not.toHaveBeenCalled()
  })

  it('forwards opaque cursors for bookmark, liked, notification, and comment pagination', async () => {
    process.env.AIFANS_API_URL = 'https://server.example'
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({items: [], nextCursor: null}), {status: 200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({items: [], nextCursor: null}), {status: 200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({items: [], nextCursor: null}), {status: 200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({...post, comments: {items: [], nextCursor: null}}), {status: 200}))
    vi.stubGlobal('fetch', request)

    await fetchBookmarks({cursor: 'bookmark cursor'})
    await fetchLiked({cursor: 'liked cursor'})
    await fetchNotifications({cursor: 'notification cursor'})
    await fetchPost(post.id, {commentCursor: 'comment cursor'})

    expect(request.mock.calls.map(([url]) => url)).toEqual([
      'https://server.example/v1/bookmarks?cursor=bookmark+cursor',
      'https://server.example/v1/likes?cursor=liked+cursor',
      'https://server.example/v1/notifications?cursor=notification+cursor',
      `https://server.example/v1/posts/${post.id}?commentCursor=comment+cursor`,
    ])
  })

  it('does not fall back to a public browser URL', async () => {
    process.env.NEXT_PUBLIC_AIFANS_API_URL = 'https://public.example/'
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    await expect(fetchFeed({kind: 'following', locale: 'zh-CN'})).resolves.toEqual({status: 'unavailable'})
    expect(request).not.toHaveBeenCalled()
  })

  it('fails safely when configuration, transport, or response validation fails', async () => {
    await expect(fetchFeed({kind: 'for_you', locale: 'en'})).resolves.toEqual({status: 'unavailable'})

    process.env.AIFANS_API_URL = 'https://server.example'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchFeed({kind: 'for_you', locale: 'en'})).resolves.toEqual({status: 'unavailable'})

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({items: [{...post, fabricated: true}], nextCursor: null}), {status: 200})))
    await expect(fetchFeed({kind: 'for_you', locale: 'en'})).resolves.toEqual({status: 'unavailable'})
  })

  it.each([
    [new Response(null, {status: 401})],
    [new Response('not json', {status: 401})],
    [new Response(JSON.stringify({unexpected: true}), {status: 401})],
  ])('maps any 401 to auth-required before parsing its body', async (response) => {
    process.env.AIFANS_API_URL = 'https://server.example'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    await expect(fetchBookmarks()).resolves.toEqual({status: 'auth-required'})
  })

  it('parses post detail and maps a missing post without fabricating content', async () => {
    process.env.AIFANS_API_URL = 'https://server.example'
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({...post, comments: {items: [], nextCursor: null}}), {status: 200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({code: 'POST_NOT_FOUND', message: 'Post not found', requestId: 'req-2'}), {status: 404}))
    vi.stubGlobal('fetch', request)

    await expect(fetchPost(post.id)).resolves.toMatchObject({status: 'ok', data: {id: post.id}})
    await expect(fetchPost(post.id)).resolves.toEqual({status: 'not-found'})
  })

  it('parses a bounded public profile and maps a hidden profile to not found', async () => {
    process.env.AIFANS_API_URL='https://server.example'
    const profile={profile:ip,followerCount:2,posts:{items:[post],nextCursor:null}}
    const request=vi.fn().mockResolvedValueOnce(Response.json(profile)).mockResolvedValueOnce(new Response(JSON.stringify({code:'PROFILE_NOT_FOUND',message:'Profile not found',requestId:'req-profile'}),{status:404}))
    vi.stubGlobal('fetch',request)
    await expect(fetchPublicProfile(ip.id,{cursor:'next page'})).resolves.toEqual({status:'ok',data:profile})
    expect(request.mock.calls[0]?.[0]).toBe(`https://server.example/v1/profiles/${ip.id}?cursor=next+page`)
    await expect(fetchPublicProfile(ip.id)).resolves.toEqual({status:'not-found'})
  })
})
