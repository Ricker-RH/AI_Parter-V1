import {describe, expect, it, vi} from 'vitest'
import type {QueryClient} from '../src/session.js'
import {createSocialRepository} from '../src/social.js'

const authorId = '11111111-1111-4111-8111-111111111111'

describe('social feed follower projection', () => {
  it('loads follower counts once per page with de-duplicated author ids', async () => {
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
      viewer_has_liked: false,
      viewer_has_bookmarked: false,
      viewer_follows_author: false,
      score: 0,
    }))
    const query = vi.fn(async (text: string, values?: unknown[]) => text.includes('social_public_ip_profile')
      ? {rows: [{id: authorId, follower_count: 7}], rowCount: 1}
      : {rows, rowCount: rows.length})
    const client = {query: query as QueryClient['query'], release: vi.fn()}
    const repository = createSocialRepository({withPublic: async (callback) => callback(client)})

    const page = await repository.listFeed({viewer: null, kind: 'for_you', limit: 2, after: null})

    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[1]?.[0]).toContain('unnest($1::uuid[])')
    expect(query.mock.calls[1]?.[1]).toEqual([[authorId]])
    expect(page.items.map((item) => item.author.followerCount)).toEqual([7, 7])
  })
})
