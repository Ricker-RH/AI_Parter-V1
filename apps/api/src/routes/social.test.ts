import {randomUUID} from 'node:crypto'
import {
  ApiErrorSchema,
  CommentThreadContextSchema,
  FeedPageSchema,
  FollowedIpPageSchema,
  NotificationSchema,
  PostDetailSchema,
  PublicCommentSchema,
  PublicIpProfileSchema,
  SearchPageSchema,
  encodeSearchCursor,
  encodeFollowedIpCursor,
} from '@aifans/contracts'
import {describe, expect, it, vi} from 'vitest'
import {createApp} from '../application.js'
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
  visualType: 'hybrid' as const,
  creator: {id: randomUUID(), username: 'luna_creator', displayName: 'Luna Creator'},
}
const post = {
  id: postId,
  body: 'A real published post',
  languageCode: 'en',
  publishedAt,
  author: ip,
  likeCount: 0,
  commentCount: 0,
  bookmarkCount: 0,
  shareCount: 0,
}
const page = FeedPageSchema.parse({items: [post], nextCursor: null})
const followedPage = FollowedIpPageSchema.parse({items: [{...ip, followerCount: 4}], nextCursor: null})
const comment = PublicCommentSchema.parse({
  id: commentId,
  postId,
  rootCommentId: commentId,
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
  likeCount: 0,
  replyCount: 0,
  bookmarkCount: 0,
  shareCount: 0,
})
const detail = PostDetailSchema.parse({
  ...post,
  comments: {groups: [], nextCursor: null},
})
const notification = NotificationSchema.parse({
  id: notificationId,
  kind: 'comment',
  actor: {
    kind: 'human',
    id: randomUUID(),
    username: 'notification_actor',
    displayName: 'Notification Actor',
  },
  postId,
  commentId,
  createdAt: publishedAt,
  readAt: null,
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
    getCommentThread: async () => ({group: {root: comment, replies: []}}),
    getPublicProfile: async () => PublicIpProfileSchema.parse({profile:ip,followerCount:0,posts:page}),
    search: async () => ({items: [], nextCursor: null}),
    follow: async () => ({created: true}),
    unfollow: async () => ({deleted: true}),
    likePost: async () => ({created: true}),
    unlikePost: async () => ({deleted: true}),
    bookmarkPost: async () => ({created: true}),
    unbookmarkPost: async () => ({deleted: true}),
    recordPostShare: async () => ({created: true}),
    likeComment: async () => ({created: true}),
    unlikeComment: async () => ({deleted: true}),
    bookmarkComment: async () => ({created: true}),
    unbookmarkComment: async () => ({deleted: true}),
    recordCommentShare: async () => ({created: true}),
    listBookmarks: async () => page,
    listLiked: async () => page,
    listFollowedIps: async () => followedPage,
    createHumanComment: async () => comment,
    listNotifications: async () => ({items: [], nextCursor: null}),
    getNotification: async () => notification,
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
  it('returns an anonymous strict comment thread context and validates its bound IDs/query',async()=>{
    const calls:unknown[]=[]; const context=CommentThreadContextSchema.parse({group:{root:comment,replies:[]}})
    const social=socialPort({getCommentThread:async input=>{calls.push(input);return input.commentId===commentId?context:null}})
    const app=createApp({auth:missingAuth,profiles:profilePort(),social})
    const response=await app.request(`/v1/posts/${postId}/comments/${commentId}/context`)
    expect(response.status).toBe(200); expect(CommentThreadContextSchema.parse(await response.json())).toEqual(context); expect(calls).toEqual([{viewer:null,postId,commentId}])
    await expectError(await app.request(`/v1/posts/${postId}/comments/${randomUUID()}/context`),404,'COMMENT_NOT_FOUND')
    await expectError(await app.request(`/v1/posts/bad/comments/${commentId}/context`),400,'INVALID_REQUEST')
    await expectError(await app.request(`/v1/posts/${postId}/comments/bad/context`),400,'INVALID_REQUEST')
    await expectError(await app.request(`/v1/posts/${postId}/comments/${commentId}/context?x=1`),400,'INVALID_REQUEST')
  })
  it('normalizes a non-leaking comment context lookup miss',async()=>{
    const social=socialPort({getCommentThread:async()=>{throw Object.assign(new Error('private target'),{code:'P0002'})}})
    const app=createApp({auth:missingAuth,profiles:profilePort(),social})
    await expectError(await app.request(`/v1/posts/${postId}/comments/${commentId}/context`),404,'COMMENT_NOT_FOUND')
  })
  it('returns only an owned notification detail through the verified actor', async () => {
    const calls: unknown[] = []
    const social = socialPort({
      getNotification: async (actor, targetId) => {
        calls.push([actor, targetId])
        return targetId === notificationId ? notification : null
      },
    })
    const app = createApp({auth: validAuth, profiles: profilePort(), social})

    const response = await app.request(`/v1/notifications/${notificationId}`)

    expect(response.status).toBe(200)
    expect(NotificationSchema.parse(await response.json())).toEqual(notification)
    expect(calls).toEqual([[{subject: identity.subject}, notificationId]])
    await expectError(await app.request(`/v1/notifications/${randomUUID()}`), 404, 'NOTIFICATION_NOT_FOUND')
    await expectError(await app.request('/v1/notifications/not-a-uuid'), 400, 'INVALID_REQUEST')
    await expectError(await app.request(`/v1/notifications/${notificationId}?actor=forged`), 400, 'INVALID_REQUEST')
    await expectError(
      await createApp({auth: missingAuth, profiles: profilePort(), social}).request(`/v1/notifications/${notificationId}`),
      401,
      'AUTH_REQUIRED',
    )
  })

  it('rejects expanded notification detail responses without leaking port fields', async () => {
    const social = socialPort({
      getNotification: async () => ({...notification, internalRecipientId: randomUUID()}),
    })
    const response = await createApp({auth: validAuth, profiles: profilePort(), social}).request(`/v1/notifications/${notificationId}`)
    const text = await response.clone().text()

    await expectError(response, 500, 'INTERNAL_ERROR')
    expect(text).not.toContain('internalRecipientId')
  })

  it('allows anonymous bounded search and binds cursors to the query', async () => {
    const calls: unknown[] = []
    const search = SearchPageSchema.parse({items: [{type: 'profile', profile: ip}], nextCursor: null})
    const social = socialPort({
      search: async (input) => {
        calls.push(input)
        return search
      },
    })
    const app = createApp({social})
    const response = await app.request('/v1/search?q=luna%20%20moon&category=ips&limit=10')
    expect(response.status).toBe(200)
    expect(SearchPageSchema.parse(await response.json())).toEqual(search)
    expect(calls).toEqual([{viewer: null, q: 'luna moon', category: 'ips', limit: 10, after: null}])
    await expectError(await app.request('/v1/search?q=%20%20'), 400, 'INVALID_REQUEST')
    await expectError(await app.request('/v1/search?q=luna&category=users'), 400, 'INVALID_REQUEST')
    await expectError(await app.request('/v1/search?q=luna&q=moon'), 400, 'INVALID_REQUEST')
    await expectError(await app.request(`/v1/search?q=luna&category=ips&cursor=${encodeSearchCursor({v: 1, kind: 'search', category: 'ips', query: 'luna', resultType: 'post', publishedAt, id: postId})}`), 400, 'INVALID_CURSOR')
  })

  it('returns SOCIAL_NOT_CONFIGURED with a correlated request ID', async () => {
    await expectError(await createApp().request('/v1/feed?kind=for_you'), 503, 'SOCIAL_NOT_CONFIGURED')
  })

  it('allows an anonymous For You feed and ignores legacy visual type filters', async () => {
    const calls: unknown[] = []
    const social = socialPort({
      listFeed: async (input) => {
        calls.push(input)
        return page
      },
    })

    const response = await createApp({social}).request('/v1/feed?kind=for_you&locale=en&visualType=anime&limit=10')

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
    const legacyResponse = await createApp({social}).request('/v1/feed?kind=for_you&visualType=portrait')
    expect(legacyResponse.status, await legacyResponse.text()).toBe(200)
    expect(calls).toContainEqual({viewer: null, kind: 'for_you', limit: 25, after: null})
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

  it('returns a bounded published IP profile and hides absent profiles', async () => {
    const calls: unknown[] = []
    const profile = PublicIpProfileSchema.parse({profile: ip, followerCount: 3, posts: page})
    const social = socialPort({
      getPublicProfile: async (input) => {
        calls.push(input)
        return input.profileId === profileId ? profile : null
      },
    })
    const app = createApp({social})
    const response = await app.request(`/v1/profiles/${profileId}?limit=10`)

    expect(response.status).toBe(200)
    expect(PublicIpProfileSchema.parse(await response.json())).toEqual(profile)
    expect(calls).toEqual([{viewer: null, profileId, limit: 10, after: null}])
    await expectError(await app.request(`/v1/profiles/${randomUUID()}`), 404, 'PROFILE_NOT_FOUND')
    await expectError(await app.request(`/v1/profiles/${profileId}?limit=1&limit=2`), 400, 'INVALID_REQUEST')
  })
})

describe('authenticated social routes', () => {
  const dependencies = (social: SocialPort) => ({auth: validAuth, profiles: profilePort(), social})

  it('records a share with optional authentication and a validated idempotency key', async () => {
    for (const auth of [validAuth, missingAuth]) {
      const calls: unknown[] = []
      const idempotencyKey = randomUUID()
      const social = socialPort({recordPostShare: async (viewer, target, key) => {
        calls.push([viewer, target, key])
        return {created: true}
      }})
      const response = await createApp({auth, profiles: profilePort(), social}).request(
        `/v1/posts/${postId}/share`,
        {method: 'POST', headers: {'idempotency-key': idempotencyKey}},
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({created: true})
      expect(calls).toEqual([[
        auth === validAuth ? {subject: identity.subject} : null,
        postId,
        idempotencyKey,
      ]])
      expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    }
  })

  it('records an anonymous share when authentication and profiles are completely unconfigured', async () => {
    const idempotencyKey = randomUUID()
    const recordPostShare = vi.fn(async () => ({created: true}))
    const response = await createApp({social: socialPort({recordPostShare})}).request(
      `/v1/posts/${postId}/share`,
      {method: 'POST', headers: {'idempotency-key': idempotencyKey}},
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({created: true})
    expect(recordPostShare).toHaveBeenCalledOnce()
    expect(recordPostShare).toHaveBeenCalledWith(null, postId, idempotencyKey)
  })

  it('returns an idempotent created false acknowledgement unchanged with status 200', async () => {
    const idempotencyKey = randomUUID()
    const recordPostShare = vi.fn(async () => ({created: false}))
    const response = await createApp({auth: missingAuth, profiles: profilePort(), social: socialPort({recordPostShare})}).request(
      `/v1/posts/${postId}/share`,
      {method: 'POST', headers: {'idempotency-key': idempotencyKey}},
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({created: false})
    expect(recordPostShare).toHaveBeenCalledOnce()
  })

  it('accepts strict empty JSON with an exact JSON media type when a body stream is present', async () => {
    const idempotencyKey = randomUUID()
    for (const contentType of ['application/json', 'application/json; charset=utf-8', 'application/json; charset="utf-8"']) {
      const response = await createApp({auth: missingAuth, profiles: profilePort(), social: socialPort()}).request(
        `/v1/posts/${postId}/share`,
        {method: 'POST', headers: {'content-type': contentType, 'idempotency-key': idempotencyKey}, body: '{}'},
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({created: true})
    }
  })

  it('rejects invalid share inputs before calling the port', async () => {
    const recordPostShare = vi.fn(async () => ({created: true}))
    const app = createApp({auth: missingAuth, profiles: profilePort(), social: socialPort({recordPostShare})})
    const key = randomUUID()
    const requests: Array<Promise<Response>> = [
      app.request(`/v1/posts/${postId}/share`, {method: 'POST'}),
      app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'idempotency-key': 'not-a-uuid'}}),
      app.request('/v1/posts/not-a-uuid/share', {method: 'POST', headers: {'idempotency-key': key}}),
      app.request(`/v1/posts/${postId}/share?count=1`, {method: 'POST', headers: {'idempotency-key': key}}),
      app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'text/plain', 'idempotency-key': key}, body: '{}'}),
      app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'text/plain', 'idempotency-key': key}, body: '   '}),
      app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'text/plain', 'idempotency-key': key}, body: ''}),
      app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'application/json; charset=latin1', 'idempotency-key': key}, body: '{}'}),
      app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'application/json; charset=utf-8; profile=x', 'idempotency-key': key}, body: '{}'}),
      app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'application/json; charset=utf-8; charset=utf-8', 'idempotency-key': key}, body: '{}'}),
      app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'application/jsonx', 'idempotency-key': key}, body: '{}'}),
      app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'application/jsonp', 'idempotency-key': key}, body: '{}'}),
      app.request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'content-type': 'application/json', 'idempotency-key': key}, body: '{"count":1}'}),
    ]
    for (const request of requests) expect((await request).status).toBe(400)
    expect((await app.request(`/v1/posts/${postId}/share`, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'idempotency-key': key},
      body: 'x'.repeat(65_537),
    })).status).toBe(413)
    expect((await app.request(`/v1/posts/${postId}/share`, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'content-length': '1', 'idempotency-key': key},
      body: 'x'.repeat(65_537),
    })).status).toBe(413)
    for (const contentLength of ['not-a-number', '-1']) {
      expect((await app.request(`/v1/posts/${postId}/share`, {
        method: 'POST',
        headers: {'content-type': 'application/json', 'content-length': contentLength, 'idempotency-key': key},
        body: '{}',
      })).status).toBe(413)
    }
    expect(recordPostShare).not.toHaveBeenCalled()
  })

  it('keeps share authentication and not-found semantics strict', async () => {
    const invalidAuth = {verify: async () => ({status: 'invalid'} as const)} satisfies AuthVerifier
    const headers = {'idempotency-key': randomUUID()}
    await expectError(
      await createApp({auth: invalidAuth, profiles: profilePort(), social: socialPort()}).request(`/v1/posts/${postId}/share`, {method: 'POST', headers}),
      401,
      'AUTH_INVALID',
    )
    await expectError(
      await createApp({
        auth: missingAuth,
        profiles: profilePort(),
        social: socialPort({recordPostShare: async () => { throw Object.assign(new Error('hidden'), {code: 'P0002'}) }}),
      })
        .request(`/v1/posts/${postId}/share`, {method: 'POST', headers}),
      404,
      'POST_NOT_FOUND',
    )
  })

  it('redacts invalid share responses and database constraint details', async () => {
    const diagnostics: unknown[] = []
    const expanded = await createApp({
      auth: missingAuth,
      profiles: profilePort(),
      social: socialPort({recordPostShare: async () => ({created: true, internal: 'secret'})}),
    }).request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'idempotency-key': randomUUID()}})
    await expectError(expanded, 500, 'INTERNAL_ERROR')

    const constrained = await createApp({
      auth: missingAuth,
      profiles: profilePort(),
      social: socialPort({recordPostShare: async () => { throw {name: 'DatabaseError', code: '23505', detail: 'secret constraint'} }}),
      onUnhandledError: (diagnostic) => diagnostics.push(diagnostic),
    }).request(`/v1/posts/${postId}/share`, {method: 'POST', headers: {'idempotency-key': randomUUID()}})
    const constrainedBody = await constrained.clone().text()
    await expectError(constrained, 500, 'INTERNAL_ERROR')
    expect(constrainedBody).not.toContain('secret constraint')
    expect(diagnostics).toEqual([{name: 'DatabaseError', code: '23505'}])
  })

  it.each([
    ['GET', '/v1/feed?kind=for_you&kind=following'],
    ['GET', `/v1/posts/${postId}?commentLimit=1&commentLimit=2`],
    ['PUT', `/v1/profiles/${profileId}/follow?actor=one&actor=two`],
    ['DELETE', `/v1/profiles/${profileId}/follow?actor=one&actor=two`],
    ['PUT', `/v1/posts/${postId}/like?actor=one&actor=two`],
    ['DELETE', `/v1/posts/${postId}/like?actor=one&actor=two`],
    ['PUT', `/v1/posts/${postId}/bookmark?actor=one&actor=two`],
    ['DELETE', `/v1/posts/${postId}/bookmark?actor=one&actor=two`],
    ['PUT', `/v1/comments/${commentId}/like?actor=one&actor=two`],
    ['POST', `/v1/comments/${commentId}/share?actor=one&actor=two`],
    ['GET', '/v1/bookmarks?limit=1&limit=2'],
    ['GET', '/v1/following?limit=1&limit=2'],
    ['GET', '/v1/notifications?limit=1&limit=2'],
    ['POST', `/v1/posts/${postId}/comments?source=one&source=two`],
    ['PUT', `/v1/notifications/${notificationId}/read?source=one&source=two`],
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
    ['PUT', `/v1/comments/${commentId}/like`, 'likeComment', {created: true}],
    ['DELETE', `/v1/comments/${commentId}/like`, 'unlikeComment', {deleted: true}],
    ['PUT', `/v1/comments/${commentId}/bookmark`, 'bookmarkComment', {created: true}],
    ['DELETE', `/v1/comments/${commentId}/bookmark`, 'unbookmarkComment', {deleted: true}],
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
      path.includes('/profiles/') ? profileId : path.includes('/comments/') ? commentId : postId,
      {requestId: response.headers.get('x-request-id')},
    ]])
  })

  it('records anonymous comment shares with a strict UUID idempotency key and no body/query fields', async () => {
    const key = randomUUID(); const calls: unknown[] = []
    const social = socialPort({recordCommentShare: async (...args) => {calls.push(args); return {created: true}}})
    const response = await createApp({auth: missingAuth, profiles: profilePort(), social}).request(`/v1/comments/${commentId}/share`, {method: 'POST', headers: {'idempotency-key': key}})
    expect(response.status).toBe(200); expect(await response.json()).toEqual({created: true}); expect(calls).toEqual([[null, commentId, key]])
    await expectError(await createApp({auth: missingAuth, profiles: profilePort(), social}).request(`/v1/comments/${commentId}/share?x=1`, {method: 'POST', headers: {'idempotency-key': key}}), 400, 'INVALID_REQUEST')
    await expectError(await createApp({auth: missingAuth, profiles: profilePort(), social}).request(`/v1/comments/${commentId}/share`, {method: 'POST', headers: {'idempotency-key': 'bad'}}), 400, 'INVALID_REQUEST')
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
    await expectError(await app.request('/v1/bookmarks?cursor=not-a-cursor'), 400, 'INVALID_CURSOR')
    await expectError(await app.request('/v1/notifications?limit=2&limit=3'), 400, 'INVALID_REQUEST')
  })

  it('lists only the verified actor liked posts and validates the private cursor', async () => {
    const calls: unknown[] = []
    const social = socialPort({
      listLiked: async (actor, query) => {
        calls.push([actor, query])
        return page
      },
    })
    const app = createApp(dependencies(social))

    expect((await app.request('/v1/likes?limit=2')).status).toBe(200)
    expect(calls).toEqual([[{subject: identity.subject}, {limit: 2}]])
    await expectError(await createApp(dependencies(social)).request('/v1/likes?limit=2&limit=3'), 400, 'INVALID_REQUEST')
    await expectError(await createApp(dependencies(social)).request('/v1/likes?cursor=not-a-cursor'), 400, 'INVALID_CURSOR')
    await expectError(await createApp({auth: missingAuth, profiles: profilePort(), social}).request('/v1/likes'), 401, 'AUTH_REQUIRED')
  })

  it('lists only the verified actor followed IPs and validates the private cursor', async () => {
    const calls: unknown[] = []
    const social = socialPort({
      listFollowedIps: async (actor, query) => {
        calls.push([actor, query])
        return followedPage
      },
    })
    const app = createApp(dependencies(social))
    const cursor = encodeFollowedIpCursor({v: 1, kind: 'followed_ips', profileCreatedAt: '2026-09-01T00:00:00.000100Z', id: profileId})

    const response = await app.request(`/v1/following?limit=2&cursor=${cursor}`)

    expect(response.status).toBe(200)
    expect(FollowedIpPageSchema.parse(await response.json())).toEqual(followedPage)
    expect(calls).toEqual([[{subject: identity.subject}, {limit: 2, cursor}]])
    await expectError(await app.request('/v1/following?cursor=not-a-cursor'), 400, 'INVALID_CURSOR')
    await expectError(await createApp({auth: missingAuth, profiles: profilePort(), social}).request('/v1/following'), 401, 'AUTH_REQUIRED')
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

  it('rejects duplicate comment body keys before calling the social port', async () => {
    let called=false
    const social=socialPort({createHumanComment:async()=>{called=true;return comment}})
    const response=await createApp(dependencies(social)).request(`/v1/posts/${postId}/comments`,{method:'POST',headers:{'content-type':'application/json'},body:'{"body":"one","body":"two"}'})
    await expectError(response,422,'COMMENT_INVALID')
    expect(called).toBe(false)
  })

  it('authenticates before reading a body and bounds both declared and streamed comment payloads',async()=>{
    const path=`/v1/posts/${postId}/comments`;const social=socialPort()
    await expectError(await createApp({auth:missingAuth,profiles:profilePort(),social}).request(path,{method:'POST',headers:{'content-type':'application/json','content-length':'9000'},body:'{}'}),401,'AUTH_REQUIRED')
    await expectError(await createApp(dependencies(social)).request(path,{method:'POST',headers:{'content-type':'application/json','content-length':'9000'},body:'{}'}),413,'PAYLOAD_TOO_LARGE')
    await expectError(await createApp(dependencies(social)).request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body:'x'.repeat(9000)})}),413,'PAYLOAD_TOO_LARGE')
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

    const response = await app.request(`/v1/notifications/${notificationId}/read`, {method: 'PUT'})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({readAt})
    expect(calls[0]).toEqual([
      {subject: identity.subject},
      notificationId,
      {requestId: response.headers.get('x-request-id')},
    ])
    await expectError(
      await app.request(`/v1/notifications/${randomUUID()}/read`, {method: 'PUT'}),
      404,
      'NOTIFICATION_NOT_FOUND',
    )
    await expectError(
      await app.request(`/v1/notifications/${notificationId}/read?source=admin`, {method: 'PUT'}),
      400,
      'INVALID_REQUEST',
    )
    await expectError(
      await app.request(`/v1/notifications/${notificationId}/read?actor=a&actor=b`, {method: 'PUT'}),
      400,
      'INVALID_REQUEST',
    )
  })

  it('returns the port idempotency result to concurrent notification read requests', async () => {
    const social = socialPort({markNotificationRead: async () => ({readAt})})
    const app = createApp(dependencies(social))

    const responses = await Promise.all([
      app.request(`/v1/notifications/${notificationId}/read`, {method: 'PUT'}),
      app.request(`/v1/notifications/${notificationId}/read`, {method: 'PUT'}),
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
    ['likeComment', `/v1/comments/${commentId}/like`, 'PUT', 'COMMENT_NOT_FOUND'],
    ['recordCommentShare', `/v1/comments/${commentId}/share`, 'POST', 'COMMENT_NOT_FOUND'],
    ['createHumanComment', `/v1/posts/${postId}/comments`, 'POST', 'POST_NOT_FOUND'],
  ] as const)('maps PostgreSQL P0002 from %s to its endpoint-specific not-found response', async (operation, path, method, code) => {
    const social = socialPort({
      [operation]: async () => { throw {code: 'P0002', message: 'sensitive SQL detail'} },
    })
    const response = await createApp(dependencies(social)).request(path, {
      method,
      ...(operation === 'createHumanComment'
        ? {headers: {'content-type': 'application/json'}, body: JSON.stringify({body: 'valid'})}
        : operation === 'recordCommentShare'
          ? {headers: {'idempotency-key': randomUUID()}}
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
