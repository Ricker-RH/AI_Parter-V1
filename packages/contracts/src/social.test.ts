import {describe, expect, it} from 'vitest'
import {
  CursorSchema,
  decodeCursor,
  encodeCursor,
  FeedQuerySchema,
  PublicCommentSchema,
  PublicIpSchema,
  FeedPostSchema,
  NotificationSchema,
} from './social.js'

const id = '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30'
const timestamp = '2026-09-01T12:00:00.000Z'

describe('social contracts', () => {
  it('strictly parses only safe public records', () => {
    const ip = {kind: 'ip' as const, id, username: 'aifans_ip', displayName: 'AIFANS IP', languages: ['en']}
    expect(PublicIpSchema.parse(ip)).toEqual(ip)
    expect(() => PublicIpSchema.parse({...ip, authSubject: 'never-public'})).toThrow()
    expect(FeedPostSchema.parse({id, body: 'Hello', languageCode: 'en', publishedAt: timestamp, author: ip, likeCount: 0, commentCount: 0})).toMatchObject({id})
    expect(PublicCommentSchema.parse({id, postId: id, parentCommentId: null, author: ip, state: 'deleted', createdAt: timestamp})).toMatchObject({state: 'deleted'})
    expect(NotificationSchema.parse({id, kind: 'follow', actor: ip, postId: null, commentId: null, createdAt: timestamp, readAt: null})).toMatchObject({id})
  })

  it('round trips cursors and rejects invalid query inputs', () => {
    const cursor = {v: 1 as const, kind: 'for_you' as const, score: 12.5, publishedAt: timestamp, id}
    expect(decodeCursor(encodeCursor(cursor), 'for_you')).toEqual(cursor)
    expect(() => decodeCursor('%%%bad', 'for_you')).toThrow()
    expect(() => decodeCursor(Buffer.from('{"v":2}', 'utf8').toString('base64url'), 'for_you')).toThrow()
    expect(() => decodeCursor(encodeCursor({v: 1, kind: 'chronological', publishedAt: timestamp, id}), 'for_you')).toThrow()
    expect(() => FeedQuerySchema.parse({kind: 'for_you', limit: '51'})).toThrow()
    expect(() => FeedQuerySchema.parse({kind: 'for_you', unexpected: 'value'})).toThrow()
    expect(CursorSchema.parse(cursor)).toEqual(cursor)
  })
})
