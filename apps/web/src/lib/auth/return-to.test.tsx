import {describe, expect, it} from 'vitest'
import {encodeChatConversationCursor, encodeChatMessageCursor, encodeCursor, encodeLikedCursor, encodeNotificationCursor, encodeSearchCursor} from '@aifans/contracts'
import {authHref, readAdminReturnTo, readUserReturnTo} from './return-to.js'

describe('admin auth return target', () => {
  it.each([
    ['zh-CN', '/zh-CN/admin'],
    ['zh-CN', '/zh-CN/admin/creator'],
    ['en', '/en/admin'],
    ['en', '/en/admin/creator'],
  ] as const)('accepts %s target %s', (locale, target) => {
    expect(readAdminReturnTo(locale, target)).toBe(target)
  })

  it.each([
    ['zh-CN', 'https://attacker.example/admin'],
    ['zh-CN', '//attacker.example/admin'],
    ['zh-CN', '/en/admin'],
    ['zh-CN', '/zh-CN/admin/users'],
    ['zh-CN', ['/zh-CN/admin']],
  ] as const)('rejects unsafe or unsupported target %#', (locale, target) => {
    expect(readAdminReturnTo(locale, target)).toBeUndefined()
  })
})

describe('user auth return target', () => {
  it('accepts a contract-sized CJK query and its encoded cursor', () => {
    const query = '月'.repeat(80)
    const cursor = encodeSearchCursor({
      v: 1, kind: 'search', category: 'ips', query, resultType: 'profile',
      displayName: query, id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
    })
    const target = `/en/search?q=${encodeURIComponent(query)}&category=ips&cursor=${cursor}`
    expect(readUserReturnTo('en', target)).toBe(target)
  })
  it('builds an encoded login href only from a validated user target', () => {
    expect(authHref('en', '/en/messages')).toBe('/en/auth/sign-in?next=%2Fen%2Fmessages')
    expect(authHref('en', 'https://attacker.example')).toBe('/en/auth/sign-in?next=%2Fen')
  })
  it('accepts a creator route only when its nested origin is a validated primary page', () => {
    const safe = '/en/creator?returnTo=%2Fen%2Fchannels'
    expect(readUserReturnTo('en', safe)).toBe(safe)
    expect(readUserReturnTo('en', '/en/creator?returnTo=https%3A%2F%2Fattacker.example')).toBeUndefined()
    expect(readUserReturnTo('en', '/en/creator?returnTo=%2Fen%2Fprofile')).toBeUndefined()
  })
  it('preserves canonical persistent-message list and detail targets in the real login href', () => {
    const id = '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30'
    const listCursor = encodeChatConversationCursor({v: 1, kind: 'chat-conversations', updatedAt: '2026-09-01T00:00:00.000Z', id})
    const detailCursor = encodeChatMessageCursor({v: 1, kind: 'chat-messages', createdAt: '2026-09-01T00:00:00.000Z', id})
    expect(authHref('en', `/en/messages?cursor=${listCursor}`)).toBe(`/en/auth/sign-in?next=${encodeURIComponent(`/en/messages?cursor=${listCursor}`)}`)
    expect(authHref('en', `/en/messages/${id}?cursor=${detailCursor}`)).toBe(`/en/auth/sign-in?next=${encodeURIComponent(`/en/messages/${id}?cursor=${detailCursor}`)}`)
    expect(authHref('en', `/en/messages/${id}?listCursor=${listCursor}`)).toBe(`/en/auth/sign-in?next=${encodeURIComponent(`/en/messages/${id}?listCursor=${listCursor}`)}`)
    expect(authHref('en', `/en/messages/${id}?listCursor=${listCursor}&cursor=${detailCursor}`)).toBe(`/en/auth/sign-in?next=${encodeURIComponent(`/en/messages/${id}?listCursor=${listCursor}&cursor=${detailCursor}`)}`)
  })
  it('preserves canonical notification list and detail targets in the real login href', () => {
    const id = '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30'
    const cursor = encodeNotificationCursor({v: 1, kind: 'notifications', createdAt: '2026-09-01T00:00:00.000Z', id})
    for (const target of [`/en/messages/notifications?cursor=${cursor}`, `/en/messages/notifications/${id}?listCursor=${cursor}`]) {
      expect(authHref('en', target)).toBe(`/en/auth/sign-in?next=${encodeURIComponent(target)}`)
    }
  })
  it('preserves protected liked, settings, and canonical collection targets in the real login href', () => {
    const id = '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30'
    const likedCursor = encodeLikedCursor({v: 1, kind: 'liked', likedAt: '2026-09-01T00:00:00.000Z', id})
    const savedCursor = encodeCursor({v: 1, kind: 'chronological', publishedAt: '2026-09-01T00:00:00.000Z', id})
    expect(authHref('en', `/en/liked?cursor=${likedCursor}`)).toBe(`/en/auth/sign-in?next=${encodeURIComponent(`/en/liked?cursor=${likedCursor}`)}`)
    expect(authHref('en', '/en/settings')).toBe('/en/auth/sign-in?next=%2Fen%2Fsettings')
    expect(authHref('en', `/en/activity?tab=liked&cursor=${likedCursor}`)).toBe(`/en/auth/sign-in?next=${encodeURIComponent(`/en/activity?tab=liked&cursor=${likedCursor}`)}`)
    expect(authHref('en', `/en/activity?tab=saved&cursor=${savedCursor}`)).toBe(`/en/auth/sign-in?next=${encodeURIComponent(`/en/activity?tab=saved&cursor=${savedCursor}`)}`)
  })
  it.each([
    ['en', '/en/messages'],
    ['en', '/en?feed=following'],
    ['zh-CN', '/zh-CN/bookmarks'],
    ['zh-CN', '/zh-CN/posts/123'],
    ['en', '/en/search?q=luna%20moon&category=posts&cursor=abc_DEF-123'],
  ] as const)('accepts the same-locale protected target %s', (locale, target) => {
    expect(readUserReturnTo(locale, target)).toBe(target)
  })

  it.each([
    ['en', 'https://attacker.example'],
    ['en', '//attacker.example'],
    ['en', '/zh-CN/messages'],
    ['en', ['/en/messages']],
    ['en', '/en'],
    ['en', '/en?feed=for_you'],
    ['en', '/en?feed=following&visualType=anime'],
    ['en', '/en?visualType=anime'],
    ['en', '/en/admin'],
    ['en', '/en/not-allowed'],
    ['en', '/en/messages#fragment'],
    ['en', '/en/search?q=luna&sort=recent'],
    ['en', '/en/search?q=luna&category=users'],
    ['en', '/en/search?q='],
    ['en', '/en/search?q=luna&q=moon'],
    ['en', '/en/search?q=luna&cursor=bad.cursor'],
    ['en', '/en/messages?cursor=not-a-chat-cursor'],
    ['en', '/en/messages?cursor=one&cursor=two'],
    ['en', '/en/messages?unknown=value'],
    ['en', '/en/messages/not-a-uuid'],
    ['en', '/en/messages/notifications?cursor=not-canonical'],
    ['en', '/en/messages/notifications/5b8ba43c-0a9e-43ec-87be-448a9e1ebf30?listCursor=not-canonical'],
    ['en', '/en/messages/5b8ba43c-0a9e-43ec-87be-448a9e1ebf30?cursor=one&cursor=two'],
    ['en', '/en/messages/5b8ba43c-0a9e-43ec-87be-448a9e1ebf30?listCursor=one&listCursor=two'],
    ['en', '/en/messages/5b8ba43c-0a9e-43ec-87be-448a9e1ebf30?listCursor=not-canonical'],
    ['en', '/en/messages/5b8ba43c-0a9e-43ec-87be-448a9e1ebf30?listCursor=one&unknown=value'],
    ['en', '/en/liked?cursor=not-canonical'],
    ['en', '/en/liked?cursor=one&cursor=two'],
    ['en', '/en/settings?appearance=dark'],
    ['en', '/en/activity?tab=other'],
    ['en', '/en/activity?tab=liked&cursor=not-canonical'],
    ['en', '/en/activity?tab=liked&tab=saved'],
    ['en', '/en/activity?tab=notifications'],
    ['en', '/en/activity?tab=notifications&cursor=one&cursor=two'],
    ['en', '/en/activity?tab=saved&unknown=value'],
  ] as const)('rejects unsafe, malformed, or unsupported user target %#', (locale, target) => {
    expect(readUserReturnTo(locale, target)).toBeUndefined()
  })
})
