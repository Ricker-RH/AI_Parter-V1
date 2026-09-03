import {decodeFollowedIpCursor, PublicIpSchema} from '@aifans/contracts'
import {describe, expect, it, vi} from 'vitest'
import type {QueryClient} from '../src/session.js'
import {createSocialRepository} from '../src/social.js'

const authorId = '11111111-1111-4111-8111-111111111111'

describe('social feed follower projection', () => {
  it('lists followed public IPs inside the verified actor transaction with a stable cursor', async () => {
    const secondId = '22222222-2222-4222-8222-222222222222'
    const rows = [
      {id: authorId, username: 'luna_ip', display_name: 'Luna', bio: null, languages: ['en'], visual_type: 'hybrid' as const, creator_id: null, creator_username: null, creator_display_name: null, follower_count: 7, profile_created_at: '2026-09-01T00:00:00.000900Z'},
      {id: secondId, username: 'nova_ip', display_name: 'Nova', bio: 'Public', languages: ['en'], visual_type: 'anime' as const, creator_id: null, creator_username: null, creator_display_name: null, follower_count: 2, profile_created_at: '2026-09-01T00:00:00.000100Z'},
    ]
    const query = vi.fn()
      .mockResolvedValueOnce({rows, rowCount: rows.length})
      .mockResolvedValueOnce({rows: [rows[1]!], rowCount: 1})
    const client = {query: query as QueryClient['query'], release: vi.fn()}
    const actor = {subject: 'verified-human'}
    const actors: unknown[] = []
    const repository = createSocialRepository({withActor: async (received, callback) => {actors.push(received); return callback(client)}})

    const page = await repository.listFollowedIps(actor, {limit: 1})

    expect(actors).toEqual([actor])
    expect(query).toHaveBeenCalledOnce()
    expect(query.mock.calls[0]?.[0]).toContain('public.social_followed_ip_profiles')
    expect(query.mock.calls[0]?.[0]).not.toContain('public.social_viewer_follows')
    expect(query.mock.calls[0]?.[0]).not.toContain('FROM public.ip_profiles')
    expect(query.mock.calls[0]?.[1]).toEqual([null, null, 2])
    expect(page.items).toEqual([expect.objectContaining({id: authorId, followerCount: 7})])
    expect(decodeFollowedIpCursor(page.nextCursor!)).toEqual({v: 1, kind: 'followed_ips', profileCreatedAt: rows[0]!.profile_created_at, id: authorId})

    const continuation = await repository.listFollowedIps(actor, {limit: 1, cursor: page.nextCursor!})

    expect(actors).toEqual([actor, actor])
    expect(query.mock.calls[1]?.[0]).toContain('public.social_followed_ip_profiles')
    expect(query.mock.calls[1]?.[0]).not.toContain('public.social_viewer_follows')
    expect(query.mock.calls[1]?.[1]).toEqual([rows[0]!.profile_created_at, authorId, 2])
    expect(continuation).toEqual({items: [expect.objectContaining({id: secondId, followerCount: 2})], nextCursor: null})
  })

  it('keeps legacy feed authors strict-compatible without a follower-count enrichment query', async () => {
    const rows = [
      ['22222222-2222-4222-8222-222222222222', 'First'],
      ['33333333-3333-4333-8333-333333333333', 'Second'],
    ].map(([postId, body], index) => ({
      id: authorId,
      username: 'luna_ip',
      display_name: 'Luna',
      bio: null,
      languages: ['en'],
      visual_type: 'hybrid' as const,
      creator_id: null,
      creator_username: null,
      creator_display_name: null,
      post_id: postId!,
      body: body!,
      language_code: 'en',
      published_at: `2026-09-01T0${index}:00:00.000Z`,
      like_count: 0,
      comment_count: 0,
      bookmark_count: 0,
      share_count: 0,
      viewer_has_liked: false,
      viewer_has_bookmarked: false,
      viewer_follows_author: false,
      score: 0,
    }))
    const query = vi.fn(async () => ({rows, rowCount: rows.length}))
    const client = {query: query as QueryClient['query'], release: vi.fn()}
    const repository = createSocialRepository({withPublic: async (callback) => callback(client)})

    const page = await repository.listFeed({viewer: null, kind: 'for_you', limit: 2, after: null})

    expect(query).toHaveBeenCalledOnce()
    expect(page.items.map((item) => PublicIpSchema.parse(item.author))).toHaveLength(2)
    expect(page.items.every((item) => !Object.hasOwn(item.author, 'followerCount'))).toBe(true)
  })
})
