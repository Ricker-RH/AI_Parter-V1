import {randomUUID} from 'node:crypto'
import {
  ApiErrorSchema,
  FeedPageSchema,
  PostDetailSchema,
  PublicCommentSchema,
} from '@aifans/contracts'
import {describe, expect, it} from 'vitest'
import {createApp} from '../app.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ProfilePort} from '../ports/profiles.js'
import type {SocialPort} from '../ports/social.js'

const postId = randomUUID()
const profileId = randomUUID()
const notificationId = randomUUID()
const commentId = randomUUID()
const publishedAt = '2026-09-01T12:00:00.000Z'
const readAt = '2026-09-01T13:00:00.000Z'
const ip = {
  kind: 'ip' as const,
  id: profileId,
  username: 'luna_ip',
  displayName: 'Luna IP',
  languages: ['en' as const],
}
const post = {
  id: postId,
  body: 'A real published post',
  languageCode: 'en',
  publishedAt,
  author: ip,
  likeCount: 0,
  commentCount: 0,
}
const page = FeedPageSchema.parse({items: [post], nextCursor: null})
const comment = PublicCommentSchema.parse({
  id: commentId,
  postId,
  parentCommentId: null,
  author: {
    kind: 'human',
    id: randomUUID(),
    username: 'human_actor',
    displayName: 'Human Actor',
  },
  state: 'published',
  body: 'A comment',
  createdAt: publishedAt,
})
const detail = PostDetailSchema.parse({
  ...post,
  comments: {items: [], nextCursor: null},
})
const identity = {
  subject: 'verified_subject',
  email: 'human@example.com',
  displayName: 'Human Actor',
}
const validAuth = {
  verify: async () => ({status: 'authenticated', identity} as const),
} satisfies AuthVerifier
const missingAuth = {
  verify: async () => ({status: 'missing'} as const),
} satisfies AuthVerifier
const account = {
  id: randomUUID(),
  kind: 'human' as const,
  username: 'human_actor',
  displayName: 'Human Actor',
  preferredLocale: 'en' as const,
  creatorModeEnabled: false,
}

function profilePort(calls: unknown[] = []): ProfilePort {
  return {
    ensureHumanProfile: async (input) => {
      calls.push(['ensure', input])
    },
    getCurrentAccount: async (actor) => {
      calls.push(['get', actor])
      return account
    },
  }
}

function socialPort(overrides: Partial<SocialPort> = {}): SocialPort {
  return {
    listFeed: async () => page,
    getPost: async () => detail,
    follow: async () => ({created: true}),
    unfollow: async () => ({deleted: true}),
    likePost: async () => ({created: true}),
    unlikePost: async () => ({deleted: true}),
    bookmarkPost: async () => ({created: true}),
    unbookmarkPost: async () => ({deleted: true}),
    listBookmarks: async () => page,
    createHumanComment: async () => comment,
    listNotifications: async () => ({items: [], nextCursor: null}),
    markNotificationRead: async () => ({readAt}),
    ...overrides,
  }
}

async function expectError(response: Response, status: number, code: string) {
  const requestId = response.headers.get('x-request-id')
  const body = ApiErrorSchema.parse(await response.json())

  expect(response.status).toBe(status)
  expect(body).toMatchObject({code, requestId})
}

describe('social read routes', () => {
  it('returns SOCIAL_NOT_CONFIGURED with a correlated request ID', async () => {
    await expectError(await createApp().request('/v1/feed?kind=for_you'), 503, 'SOCIAL_NOT_CONFIGURED')
  })

  it('allows an anonymous For You feed and strictly parses its query', async () => {
    const calls: unknown[] = []
    const social = socialPort({
      listFeed: async (input) => {
        calls.push(input)
        return page
      },
    })

    const response = await createApp({social}).request('/v1/feed?kind=for_you&locale=en&limit=10')

    expect(response.status).toBe(200)
    expect(FeedPageSchema.parse(await response.json())).toEqual(page)
    expect(calls).toEqual([{viewer: null, kind: 'for_you', locale: 'en', limit: 10, after: null}])
    await expectError(
      await createApp({social}).request('/v1/feed?kind=for_you&actor=forged'),
      400,
      'INVALID_REQUEST',
    )
    await expectError(
      await createApp({social}).request('/v1/feed?kind=for_you&kind=following'),
      400,
      'INVALID_REQUEST',
    )
  })

  it('rejects malformed and kind-mismatched feed cursors', async () => {
    const social = socialPort()
    await expectError(
      await createApp({social}).request('/v1/feed?kind=for_you&cursor=not-a-cursor'),
      400,
      'INVALID_CURSOR',
    )
    const chronological = Buffer.from(JSON.stringify({
      v: 1,
      kind: 'chronological',
      publishedAt,
      id: postId,
    })).toString('base64url')
    await expectError(
      await createApp({social}).request(`/v1/feed?kind=for_you&cursor=${chronological}`),
      400,
      'INVALID_CURSOR',
    )
  })

  it('requires a human actor for Following and derives it only from auth', async () => {
    const calls: unknown[] = []
    const profiles = profilePort(calls)
    const social = socialPort({
      listFeed: async (input) => {
        calls.push(['feed', input])
        return page
      },
    })

    await expectError(
      await createApp({auth: missingAuth, profiles, social}).request('/v1/feed?kind=following'),
      401,
      'AUTH_REQUIRED',
    )
    const response = await createApp({auth: validAuth, profiles, social}).request('/v1/feed?kind=following')

    expect(response.status).toBe(200)
    expect(calls).toEqual([
      ['ensure', {
        authSubject: identity.subject,
        email: identity.email,
        displayName: identity.displayName,
      }],
      ['get', {subject: identity.subject}],
      ['feed', {viewer: {subject: identity.subject}, kind: 'following', limit: 25, after: null}],
    ])
  })

  it('returns public post detail and hides missing posts', async () => {
    const calls: unknown[] = []
    const social = socialPort({
      getPost: async (input) => {
        calls.push(input)
        return input.postId === postId ? detail : null
      },
    })
    const app = createApp({social})

    const response = await app.request(`/v1/posts/${postId}?commentLimit=7`)
    expect(response.status).toBe(200)
    expect(PostDetailSchema.parse(await response.json())).toEqual(detail)
    expect(calls).toEqual([{
      viewer: null,
      postId,
      commentLimit: 7,
      commentAfter: null,
    }])
    await expectError(await app.request(`/v1/posts/${randomUUID()}`), 404, 'POST_NOT_FOUND')
    await expectError(await app.request('/v1/posts/not-a-uuid'), 400, 'INVALID_REQUEST')
    await expectError(
      await app.request(`/v1/posts/${postId}?commentLimit=2&commentLimit=3`),
      400,
      'INVALID_REQUEST',
    )
  })
})

describe('authenticated social routes', () => {
  const dependencies = (social: SocialPort) => ({auth: validAuth, profiles: profilePort(), social})

  it.each([
    ['GET', '/v1/feed?kind=for_you&kind=following'],
    ['GET', `/v1/posts/${postId}?commentLimit=1&commentLimit=2`],
    ['PUT', `/v1/profiles/${profileId}/follow?actor=one&actor=two`],
    ['DELETE', `/v1/profiles/${profileId}/follow?actor=one&actor=two`],
    ['PUT', `/v1/posts/${postId}/like?actor=one&actor=two`],
    ['DELETE', `/v1/posts/${postId}/like?actor=one&actor=two`],
    ['PUT', `/v1/posts/${postId}/bookmark?actor=one&actor=two`],
    ['DELETE', `/v1/posts/${postId}/bookmark?actor=one&actor=two`],
    ['GET', '/v1/bookmarks?limit=1&limit=2'],
    ['GET', '/v1/notifications?limit=1&limit=2'],
    ['POST', `/v1/posts/${postId}/comments?source=one&source=two`],
    ['POST', `/v1/notifications/${notificationId}/read?source=one&source=two`],
  ] as const)('rejects duplicate query keys on %s %s', async (method, path) => {
    await expectError(
      await createApp(dependencies(socialPort())).request(path, {method}),
      400,
      'INVALID_REQUEST',
    )
  })

  it.each([
    ['PUT', `/v1/profiles/${profileId}/follow`, 'follow', {created: true}],
    ['DELETE', `/v1/profiles/${profileId}/follow`, 'unfollow', {deleted: true}],
    ['PUT', `/v1/posts/${postId}/like`, 'likePost', {created: true}],
    ['DELETE', `/v1/posts/${postId}/like`, 'unlikePost', {deleted: true}],
    ['PUT', `/v1/posts/${postId}/bookmark`, 'bookmarkPost', {created: true}],
    ['DELETE', `/v1/posts/${postId}/bookmark`, 'unbookmarkPost', {deleted: true}],
  ] as const)('%s %s derives the actor and returns the idempotent result', async (method, path, operation, result) => {
    const calls: unknown[] = []
    const social = socialPort({
      [operation]: async (actor: unknown, targetId: string, context: unknown) => {
        calls.push([actor, targetId, context])
        return result
      },
    })

    const response = await createApp(dependencies(social)).request(path, {method})

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(result)
    expect(calls).toEqual([[
      {subject: identity.subject},
      path.includes('/profiles/') ? profileId : postId,
      {requestId: response.headers.get('x-request-id')},
    ]])
  })

  it('rejects forged fields on bodyless mutations before calling the port', async () => {
    let called = false
    const social = socialPort({
      likePost: async () => {
        called = true
        return {created: true}
      },
    })
    const response = await createApp(dependencies(social)).request(`/v1/posts/${postId}/like`, {
      method: 'PUT',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({actor: 'forged', source: 'admin', operator: randomUUID()}),
    })

    await expectError(response, 400, 'INVALID_REQUEST')
    expect(called).toBe(false)

    await expectError(
      await createApp(dependencies(social)).request(`/v1/posts/${postId}/like?actor=forged`, {method: 'PUT'}),
      400,
      'INVALID_REQUEST',
    )
    await expectError(
      await createApp(dependencies(social)).request(`/v1/posts/${postId}/like?source=one&source=two`, {method: 'PUT'}),
      400,
      'INVALID_REQUEST',
    )
  })

  it('lists only the verified actor bookmarks and notifications', async () => {
    const calls: unknown[] = []
    const social = socialPort({
      listBookmarks: async (actor, query) => {
        calls.push(['bookmarks', actor, query])
        return page
      },
      listNotifications: async (actor, query) => {
        calls.push(['notifications', actor, query])
        return {items: [], nextCursor: null}
      },
    })
    const app = createApp(dependencies(social))

    expect((await app.request('/v1/bookmarks?limit=2')).status).toBe(200)
    expect((await app.request('/v1/notifications?limit=3')).status).toBe(200)
    expect(calls).toEqual([
      ['bookmarks', {subject: identity.subject}, {limit: 2}],
      ['notifications', {subject: identity.subject}, {limit: 3}],
    ])
    await expectError(await app.request('/v1/bookmarks?limit=2&limit=3'), 400, 'INVALID_REQUEST')
    await expectError(await app.request('/v1/notifications?limit=2&limit=3'), 400, 'INVALID_REQUEST')
  })

  it.each([
    'not-a-cursor',
    Buffer.from(JSON.stringify({v: 1, kind: 'comments', createdAt: publishedAt, id: notificationId})).toString('base64url'),
    Buffer.from(JSON.stringify({v: 1, kind: 'notifications', createdAt: 'not-a-date', id: notificationId})).toString('base64url'),
    Buffer.from(JSON.stringify({v: 1, kind: 'notifications', createdAt: publishedAt, id: notificationId, actor: 'forged'})).toString('base64url'),
  ])('rejects an invalid notification cursor before calling the port', async (cursor) => {
    let called = false
    const social = socialPort({
      listNotifications: async () => {
        called = true
        return {items: [], nextCursor: null}
      },
    })

    await expectError(
      await createApp(dependencies(social)).request(`/v1/notifications?cursor=${cursor}`),
      400,
      'INVALID_CURSOR',
    )
    expect(called).toBe(false)
  })

  it('creates only a strict human comment body as the verified actor', async () => {
    const calls: unknown[] = []
    const social = socialPort({
      createHumanComment: async (actor, targetPostId, input, context) => {
        calls.push([actor, targetPostId, input, context])
        return comment
      },
    })
    const app = createApp(dependencies(social))
    const response = await app.request(`/v1/posts/${postId}/comments`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({body: '  A comment  '}),
    })

    expect(response.status).toBe(201)
    expect(PublicCommentSchema.parse(await response.json())).toEqual(comment)
    expect(calls).toEqual([[
      {subject: identity.subject},
      postId,
      {body: 'A comment'},
      {requestId: response.headers.get('x-request-id')},
    ]])
    await expectError(
      await app.request(`/v1/posts/${postId}/comments`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({body: 'hello', source: 'admin'}),
      }),
      422,
      'COMMENT_INVALID',
    )
    await expectError(
      await app.request(`/v1/posts/${postId}/comments?source=admin`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({body: 'valid'}),
      }),
      400,
      'INVALID_REQUEST',
    )
    await expectError(
      await app.request(`/v1/posts/${postId}/comments?actor=a&actor=b`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({body: 'valid'}),
      }),
      400,
      'INVALID_REQUEST',
    )
  })

  it('marks an owned notification read and hides absent or non-owned records', async () => {
    const calls: unknown[] = []
    const social = socialPort({
      markNotificationRead: async (actor, targetId, context) => {
        calls.push([actor, targetId, context])
        return targetId === notificationId ? {readAt} : null
      },
    })
    const app = createApp(dependencies(social))

    const response = await app.request(`/v1/notifications/${notificationId}/read`, {method: 'POST'})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({readAt})
    expect(calls[0]).toEqual([
      {subject: identity.subject},
      notificationId,
      {requestId: response.headers.get('x-request-id')},
    ])
    await expectError(
      await app.request(`/v1/notifications/${randomUUID()}/read`, {method: 'POST'}),
      404,
      'NOTIFICATION_NOT_FOUND',
    )
    await expectError(
      await app.request(`/v1/notifications/${notificationId}/read?source=admin`, {method: 'POST'}),
      400,
      'INVALID_REQUEST',
    )
    await expectError(
      await app.request(`/v1/notifications/${notificationId}/read?actor=a&actor=b`, {method: 'POST'}),
      400,
      'INVALID_REQUEST',
    )
  })

  it('returns the port idempotency result to concurrent notification read requests', async () => {
    const social = socialPort({markNotificationRead: async () => ({readAt})})
    const app = createApp(dependencies(social))

    const responses = await Promise.all([
      app.request(`/v1/notifications/${notificationId}/read`, {method: 'POST'}),
      app.request(`/v1/notifications/${notificationId}/read`, {method: 'POST'}),
    ])

    expect(responses.map(({status}) => status)).toEqual([200, 200])
    await expect(Promise.all(responses.map((response) => response.json()))).resolves.toEqual([{readAt}, {readAt}])
  })

  it('requires auth and profiles for mutations', async () => {
    const social = socialPort()
    await expectError(
      await createApp({auth: missingAuth, profiles: profilePort(), social}).request(`/v1/posts/${postId}/like`, {method: 'PUT'}),
      401,
      'AUTH_REQUIRED',
    )
    await expectError(
      await createApp({auth: validAuth, social}).request(`/v1/posts/${postId}/like`, {method: 'PUT'}),
      503,
      'PROFILE_NOT_CONFIGURED',
    )
  })

  it('maps collaborator cursor and comment errors without leaking details', async () => {
    await expectError(
      await createApp(dependencies(socialPort({listNotifications: async () => { throw new Error('INVALID_CURSOR') }}))).request('/v1/notifications?cursor=opaque'),
      400,
      'INVALID_CURSOR',
    )
    await expectError(
      await createApp(dependencies(socialPort({createHumanComment: async () => { throw new Error('COMMENT_INVALID') }}))).request(`/v1/posts/${postId}/comments`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({body: 'valid'}),
      }),
      422,
      'COMMENT_INVALID',
    )
    const response = await createApp(dependencies(socialPort({likePost: async () => { throw new Error('database password leaked') }}))).request(`/v1/posts/${postId}/like`, {method: 'PUT'})
    const text = await response.clone().text()
    await expectError(response, 500, 'INTERNAL_ERROR')
    expect(text).not.toContain('database password leaked')
  })

  it.each([
    ['follow', `/v1/profiles/${profileId}/follow`, 'PUT', 'PROFILE_NOT_FOUND'],
    ['likePost', `/v1/posts/${postId}/like`, 'PUT', 'POST_NOT_FOUND'],
    ['createHumanComment', `/v1/posts/${postId}/comments`, 'POST', 'POST_NOT_FOUND'],
  ] as const)('maps PostgreSQL P0002 from %s to its endpoint-specific not-found response', async (operation, path, method, code) => {
    const social = socialPort({
      [operation]: async () => { throw {code: 'P0002', message: 'sensitive SQL detail'} },
    })
    const response = await createApp(dependencies(social)).request(path, {
      method,
      ...(operation === 'createHumanComment'
        ? {headers: {'content-type': 'application/json'}, body: JSON.stringify({body: 'valid'})}
        : {}),
    })
    const text = await response.clone().text()

    await expectError(response, 404, code)
    expect(text).not.toContain('sensitive SQL detail')
  })

  it('maps PostgreSQL authorization errors without requiring Error instances', async () => {
    const social = socialPort({likePost: async () => { throw {code: '42501', message: 'policy details'} }})
    const response = await createApp(dependencies(social)).request(`/v1/posts/${postId}/like`, {method: 'PUT'})
    const text = await response.clone().text()

    await expectError(response, 403, 'FORBIDDEN')
    expect(text).not.toContain('policy details')
  })

  it.each([
    {code: '23503', message: 'violates foreign key constraint comments_parent_comment_id_fkey'},
    {code: '23514', message: 'violates comment constraint'},
    {code: 'P0001', message: 'comments permit one reply level'},
    {code: 'P0001', message: 'comment parent must belong to the same post'},
  ])('maps PostgreSQL comment constraint error $code to COMMENT_INVALID', async (databaseError) => {
    const social = socialPort({createHumanComment: async () => { throw databaseError }})
    const response = await createApp(dependencies(social)).request(`/v1/posts/${postId}/comments`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({body: 'valid'}),
    })
    const text = await response.clone().text()

    await expectError(response, 422, 'COMMENT_INVALID')
    expect(text).not.toContain(databaseError.message)
  })
})
