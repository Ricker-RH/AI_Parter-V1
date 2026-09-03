import type {SearchResult} from '@aifans/contracts'
import {describe, expect, it} from 'vitest'
import {rankPopularSearchResults} from './search-ranking.js'

const profile = {kind: 'ip' as const, id: '11111111-1111-4111-8111-111111111111', username: 'luna_ip', displayName: 'Luna', bio: 'Moon stories', languages: ['en' as const], visualType: 'anime' as const}
const post = (id: string, body: string, likeCount: number, commentCount: number): SearchResult => ({type: 'post', post: {id, body, languageCode: 'en', publishedAt: '2026-09-01T12:00:00.000Z', author: profile, likeCount, commentCount, bookmarkCount: 0, shareCount: 0}})

describe('rankPopularSearchResults', () => {
  it('uses explainable text relevance before engagement and a stable id tie-break', () => {
    const results: SearchResult[] = [
      post('33333333-3333-4333-8333-333333333333', 'A luna field note', 100, 50),
      post('22222222-2222-4222-8222-222222222222', 'luna', 1, 0),
      {type: 'profile', profile},
      post('44444444-4444-4444-8444-444444444444', 'Luna', 8, 5),
    ]

    expect(rankPopularSearchResults(results, 'luna').map((item) => item.type === 'profile' ? `profile:${item.profile.id}` : `post:${item.post.id}`)).toEqual([
      'profile:11111111-1111-4111-8111-111111111111',
      'post:44444444-4444-4444-8444-444444444444',
      'post:22222222-2222-4222-8222-222222222222',
      'post:33333333-3333-4333-8333-333333333333',
    ])
  })

  it('does not mutate the API page order it receives', () => {
    const results = [post('22222222-2222-4222-8222-222222222222', 'luna', 1, 0), {type: 'profile' as const, profile}]
    const snapshot = [...results]
    rankPopularSearchResults(results, 'luna')
    expect(results).toEqual(snapshot)
  })
})
