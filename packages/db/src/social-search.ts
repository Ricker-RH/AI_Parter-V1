import {
  type SearchCategory,
  type SearchPage,
  type SearchResult,
  encodeSearchCursor,
} from '@aifans/contracts'

export function searchPostFetchLimit({category, profileCount, limit}: {category: SearchCategory; profileCount: number; limit: number}) {
  if (category === 'ips' || profileCount > limit) return 0
  return Math.max(1, limit - profileCount + 1)
}

export function paginateSearchResults({category, query, profiles, posts, limit}: {category: SearchCategory; query: string; profiles: SearchResult[]; posts: SearchResult[]; limit: number}): SearchPage {
  const profileItems = profiles.filter((item) => item.type === 'profile')
  const postItems = posts.filter((item) => item.type === 'post')
  const pageProfiles = profileItems.slice(0, limit)
  const combined = [...pageProfiles, ...postItems]
  const items = combined.slice(0, limit)
  const last = items.at(-1)

  // Profiles are intentionally ordered before posts for `all`. A full profile
  // page must remain resumable even when posts were probed to prove that the
  // next phase exists; the next request exhausts profiles before posts.
  const profileContinuation =
    profileItems.length > limit ||
    (category === 'all' && profileItems.length === limit && postItems.length > 0)
  let nextCursor: string | null = null
  if (last && profileContinuation && last.type === 'profile') {
    nextCursor = encodeSearchCursor({
      v: 1,
      kind: 'search',
      category,
      query,
      resultType: 'profile',
      displayName: last.profile.displayName,
      id: last.profile.id,
    })
  } else if (last && combined.length > limit && last.type === 'post') {
    nextCursor = encodeSearchCursor({
      v: 1,
      kind: 'search',
      category,
      query,
      resultType: 'post',
      publishedAt: last.post.publishedAt,
      id: last.post.id,
    })
  }
  return {items, nextCursor}
}
