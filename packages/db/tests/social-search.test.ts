import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import type {SearchResult} from '@aifans/contracts'
import {paginateSearchResults, searchPostFetchLimit} from '../src/social-search.js'

const id = (n: number) => `5b8ba43c-0a9e-43ec-87be-${n.toString(16).padStart(12, '0')}`
const profile = (n: number): SearchResult => ({type: 'profile', profile: {
  kind: 'ip', id: id(n), username: `ip_${n}`, displayName: `IP ${n}`,
  languages: ['en'], visualType: 'hybrid',
}})
const post = (n: number): SearchResult => ({type: 'post', post: {
  id: id(100 + n), body: `Post ${n}`, languageCode: 'en', publishedAt: `2026-09-01T12:${n.toString().padStart(2, '0')}:00.000Z`,
  author: profile(1).profile, likeCount: 0, commentCount: 0,
}})

describe('mixed public search pagination', () => {
  it('search post projection includes public metrics and viewer capability flags', () => {
    const migration = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../migrations/202609020001_public_search.sql'), 'utf8')
    expect(migration).toContain('like_count integer')
    expect(migration).toContain('comment_count integer')
    expect(migration).toContain('viewer_has_liked boolean')
    expect(migration).toContain('viewer_has_bookmarked boolean')
    expect(migration).toContain('viewer_follows_author boolean')
    expect(migration).toContain('social_post_metrics')
    expect(migration).toContain('social_viewer_flags')
  })

  it('does not query posts when profiles exceed the page limit', () => {
    expect(searchPostFetchLimit({category: 'all', profileCount: 4, limit: 3})).toBe(0)
    const page = paginateSearchResults({category: 'all', query: 'luna', profiles: [profile(1), profile(2), profile(3), profile(4)], posts: [], limit: 3})
    expect(page.items.map((item) => item.type)).toEqual(['profile', 'profile', 'profile'])
    expect(page.nextCursor).toBeTruthy()
  })

  it('fills a final partial profile page with posts and returns a post cursor', () => {
    expect(searchPostFetchLimit({category: 'all', profileCount: 1, limit: 3})).toBe(3)
    const page = paginateSearchResults({category: 'all', query: 'luna', profiles: [profile(1)], posts: [post(1), post(2), post(3)], limit: 3})
    expect(page.items.map((item) => item.type)).toEqual(['profile', 'post', 'post'])
    expect(page.nextCursor).toBeTruthy()
    expect(page.nextCursor && Buffer.from(page.nextCursor, 'base64url').toString()).toContain('"resultType":"post"')
  })

  it('keeps a continuation when exactly limit profiles have posts behind them', () => {
    const page = paginateSearchResults({category: 'all', query: 'luna', profiles: [profile(1), profile(2), profile(3)], posts: [post(1)], limit: 3})
    expect(page.items).toHaveLength(3)
    expect(page.items.every((item) => item.type === 'profile')).toBe(true)
    expect(page.nextCursor).toBeTruthy()
    expect(page.nextCursor && Buffer.from(page.nextCursor, 'base64url').toString()).toContain('"resultType":"profile"')
  })

  it('continues post pages without duplicating the post cursor page', () => {
    const firstPage = paginateSearchResults({category: 'all', query: 'luna', profiles: [], posts: [post(1), post(2), post(3)], limit: 2})
    const cursorPage = paginateSearchResults({category: 'all', query: 'luna', profiles: [], posts: [post(3), post(4), post(5)], limit: 2})
    expect(firstPage.items.map((item) => item.type)).toEqual(['post', 'post'])
    expect(cursorPage.items.map((item) => item.type)).toEqual(['post', 'post'])
    const firstIds = firstPage.items.flatMap((item) => item.type === 'post' ? [item.post.id] : [])
    const nextIds = cursorPage.items.flatMap((item) => item.type === 'post' ? [item.post.id] : [])
    expect(nextIds.some((nextId) => firstIds.includes(nextId))).toBe(false)
    expect(cursorPage.nextCursor && Buffer.from(cursorPage.nextCursor, 'base64url').toString()).toContain('"id":"'+id(104)+'"')
  })
})
