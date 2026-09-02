import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {fetchFeed, fetchSearch, optionalAccess, authRedirect} = vi.hoisted(() => ({fetchFeed: vi.fn(), fetchSearch: vi.fn(), optionalAccess: vi.fn(), authRedirect: vi.fn()}))
vi.mock('../../../lib/social-api.js', () => ({fetchFeed, fetchSearch}))
vi.mock('../../../lib/auth/access-policy.js', () => ({getOptionalPageAccess: optionalAccess, redirectToUserSignIn: authRedirect}))
vi.mock('next/navigation', async (importOriginal) => ({...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => ({push: vi.fn(), refresh: vi.fn(), replace: vi.fn()})}))

import SearchPage from './page.js'

const profile = {
  kind: 'ip' as const,
  id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
  username: 'luna_ip',
  displayName: 'Luna',
  bio: 'A quiet moonlit storyteller.',
  languages: ['en' as const],
  visualType: 'anime' as const,
}

describe('public search page', () => {
  beforeEach(() => {
    fetchFeed.mockReset().mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
    fetchSearch.mockReset(); optionalAccess.mockReset().mockResolvedValue({status: 'anonymous'}); authRedirect.mockReset()
  })

  it('renders an anonymous search form without requesting an empty query', async () => {
    render(await SearchPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))
    expect(screen.getByRole('search')).toBeVisible()
    expect(screen.getByRole('combobox', {name: 'Search AI/IP profiles and posts'})).toHaveAttribute('placeholder', 'Search AI/IP profiles and posts')
    expect(screen.getByRole('combobox', {name: 'Search AI/IP profiles and posts'})).toHaveAttribute('maxlength', '80')
    expect(screen.getByText('Search AI/IP profiles and posts')).toHaveClass('sr-only')
    expect(screen.getByRole('heading', {level: 1, name: 'Search'})).toHaveClass('sr-only')
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getByRole('heading', {name: 'Recommended follows'})).toBeVisible()
    expect(fetchSearch).not.toHaveBeenCalled()
    expect(fetchFeed).toHaveBeenCalledWith(expect.objectContaining({kind: 'for_you', locale: 'en'}))
  })

  it('deduplicates real feed authors for recommendations without mock identities', async () => {
    const feedPost = {id: '22222222-2222-4222-8222-222222222222', body: 'Moon', languageCode: 'en', publishedAt: '2026-09-01T12:00:00.000Z', author: profile, likeCount: 1, commentCount: 0}
    fetchFeed.mockResolvedValue({status: 'ok', data: {items: [feedPost, {...feedPost, id: '33333333-3333-4333-8333-333333333333'}], nextCursor: null}})
    render(await SearchPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))

    expect(screen.getAllByText('Luna')).toHaveLength(1)
    expect(screen.getByRole('link', {name: 'Follow'})).toHaveAttribute('href', expect.stringContaining('/en/auth/sign-in'))
  })

  it('uses the matching Chinese AI/IP-and-posts search copy', async () => {
    render(await SearchPage({params: Promise.resolve({locale: 'zh-CN'}), searchParams: Promise.resolve({})}))
    expect(screen.getByRole('combobox', {name: '搜索 AI/IP 资料和帖子'})).toHaveAttribute('placeholder', '搜索 AI/IP 资料和帖子')
  })

  it('requests normalized query results and renders public profiles', async () => {
    fetchSearch.mockResolvedValue({status: 'ok', data: {items: [{type: 'profile', profile}], nextCursor: null}})
    render(await SearchPage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({q: '  luna  ', category: 'ips'}),
    }))
    expect(fetchSearch).toHaveBeenCalledWith(expect.objectContaining({q: 'luna', category: 'ips'}))
    expect(screen.getByText('Luna')).toBeVisible()
    expect(screen.getByText('Luna').closest('article')).toHaveClass('profile-result')
    expect(screen.getByText('@luna_ip')).toBeVisible()
    expect(screen.getByText('A quiet moonlit storyteller.')).toBeVisible()
    expect(screen.queryByText('Anime')).toBeNull()
    expect(screen.queryByRole('button', {name: 'Follow'})).toBeNull()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Popular', 'Recent', 'Profiles'])
  })

  it('renders the no-results state', async () => {
    fetchSearch.mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
    render(await SearchPage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({q: 'unknown'}),
    }))
    expect(screen.getByText('No results found')).toBeVisible()
    expect(screen.queryByRole('heading', {name: 'Search results'})).toBeNull()
  })

  it('bounds query input and ignores duplicate or unsafe routing values', async () => {
    fetchSearch.mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
    const longQuery = `  ${'x'.repeat(100)}  `
    await SearchPage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({q: longQuery, category: ['posts', 'ips'], cursor: 'bad.cursor', unknown: 'ignored'}),
    })
    expect(fetchSearch).toHaveBeenCalledWith({q: 'x'.repeat(80), category: 'all'})

    fetchSearch.mockClear()
    await SearchPage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({q: ['luna', 'moon'], category: 'not-real', cursor: ['first', 'second']}),
    })
    expect(fetchSearch).not.toHaveBeenCalled()
  })

  it('passes the optional authenticated token so signed-in users keep interaction capabilities', async () => {
    optionalAccess.mockResolvedValue({status: 'authenticated', token: 'token'})
    fetchSearch.mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
    await SearchPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({q: 'luna'})})
    expect(optionalAccess).toHaveBeenCalledOnce()
    expect(fetchSearch).toHaveBeenCalledWith(expect.objectContaining({q: 'luna', token: 'token'}))
  })

  it('keeps the current cursor in post interaction return paths', async () => {
    fetchSearch.mockResolvedValue({status: 'ok', data: {items: [{type: 'post', post: {
      id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf31', body: 'A post', languageCode: 'en', publishedAt: '2026-09-01T12:00:00.000Z', author: profile,
      likeCount: 0, commentCount: 0,
    }}], nextCursor: null}})
    render(await SearchPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({q: 'luna', category: 'posts', cursor: 'abc_DEF-123'})}))
    expect(fetchSearch).toHaveBeenCalledWith(expect.objectContaining({cursor: 'abc_DEF-123'}))
    expect(screen.getByRole('link', {name: 'Like'})).toHaveAttribute('href', expect.stringContaining(encodeURIComponent('/en/search?q=luna&category=posts&cursor=abc_DEF-123')))
  })

  it('redirects a stale authenticated search session to the bounded search URL', async () => {
    optionalAccess.mockResolvedValue({status: 'authenticated', token: 'expired-token'})
    fetchSearch.mockResolvedValue({status: 'auth-required'})
    await SearchPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({q: 'luna', category: 'ips', cursor: 'abc_DEF-123'})})
    expect(authRedirect).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/search?q=luna&category=ips&cursor=abc_DEF-123'})
  })

  it('links anonymous profile results to sign in while authenticated users can open the profile', async () => {
    fetchSearch.mockResolvedValue({status: 'ok', data: {items: [{type: 'profile', profile}], nextCursor: null}})
    render(await SearchPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({q: 'luna'})}))
    expect(screen.getAllByRole('link', {name: 'Luna'}).every((link) => link.getAttribute('href') === '/en/auth/sign-in?next=%2Fen%2Fprofiles%2F5b8ba43c-0a9e-43ec-87be-448a9e1ebf30')).toBe(true)

    optionalAccess.mockResolvedValue({status: 'authenticated', token: 'token'})
    render(await SearchPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({q: 'luna'})}))
    expect(screen.getAllByRole('link', {name: 'Luna'}).at(-1)).toHaveAttribute('href', '/en/profiles/5b8ba43c-0a9e-43ec-87be-448a9e1ebf30')
  })
})
