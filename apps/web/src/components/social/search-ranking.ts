import type {SearchResult} from '@aifans/contracts'

function textScore(value: string, query: string) {
  const normalized = value.trim().toLocaleLowerCase()
  if (normalized === query) return 100
  if (normalized.startsWith(query)) return 72
  if (normalized.includes(query)) return 44
  return 0
}

function score(item: SearchResult, query: string) {
  if (item.type === 'profile') {
    return {
      engagement: 0,
      relevance: Math.max(textScore(item.profile.displayName, query), textScore(item.profile.username, query)) + 40,
      stableId: item.profile.id,
    }
  }
  return {
    engagement: item.post.likeCount * 2 + item.post.commentCount,
    relevance: textScore(item.post.body, query) + Math.max(textScore(item.post.author.displayName, query), textScore(item.post.author.username, query)) * 0.3,
    stableId: item.post.id,
  }
}

export function rankPopularSearchResults(items: readonly SearchResult[], query: string): SearchResult[] {
  const normalized = query.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  return [...items].sort((left, right) => {
    const a = score(left, normalized)
    const b = score(right, normalized)
    return b.relevance - a.relevance || b.engagement - a.engagement || a.stableId.localeCompare(b.stableId)
  })
}
