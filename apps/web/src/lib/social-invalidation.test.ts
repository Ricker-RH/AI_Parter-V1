import {afterEach, describe, expect, it, vi} from 'vitest'

const {revalidateTag} = vi.hoisted(() => ({revalidateTag: vi.fn()}))
vi.mock('next/cache', () => ({revalidateTag}))

import {invalidateSocialMutation, socialMutationTags} from './social-invalidation.js'

afterEach(() => revalidateTag.mockReset())

describe('social mutation invalidation', () => {
  it('maps only fixed post mutations to the existing locale feed tags', () => {
    expect(socialMutationTags({method: 'POST', path: 'posts/22222222-2222-4222-8222-222222222222/comments'})).toEqual(['feed:for_you:en', 'feed:for_you:zh-CN'])
    expect(socialMutationTags({method: 'PUT', path: 'posts/22222222-2222-4222-8222-222222222222/like'})).toEqual(['feed:for_you:en', 'feed:for_you:zh-CN'])
    expect(socialMutationTags({method: 'DELETE', path: 'posts/22222222-2222-4222-8222-222222222222/like'})).toEqual(['feed:for_you:en', 'feed:for_you:zh-CN'])
    expect(socialMutationTags({method: 'PUT', path: 'posts/22222222-2222-4222-8222-222222222222/bookmark'})).toEqual([])
    expect(socialMutationTags({method: 'PUT', path: 'profiles/11111111-1111-4111-8111-111111111111/follow'})).toEqual([])
    expect(socialMutationTags({method: 'PUT', path: 'notifications/11111111-1111-4111-8111-111111111111/read'})).toEqual([])
  })

  it('revalidates only the fixed tags selected by the server route', () => {
    invalidateSocialMutation({method: 'POST', path: 'posts/22222222-2222-4222-8222-222222222222/comments'})
    expect(revalidateTag).toHaveBeenCalledWith('feed:for_you:en', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('feed:for_you:zh-CN', 'max')
  })
})
