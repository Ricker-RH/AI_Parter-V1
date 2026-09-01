import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {fetchSearch, optionalAccess, authRedirect} = vi.hoisted(() => ({fetchSearch: vi.fn(), optionalAccess: vi.fn(), authRedirect: vi.fn()}))
vi.mock('../../../lib/social-api.js', () => ({fetchSearch}))
vi.mock('../../../lib/auth/access-policy.js', () => ({getOptionalPageAccess: optionalAccess, redirectToUserSignIn: authRedirect}))

import SearchPage from './page.js'

const profile = {
  kind: 'ip' as const,
  id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
  username: 'luna_ip',
  displayName: 'Luna',
  languages: ['en' as const],
  visualType: 'anime' as const,
}

describe('public search page', () => {
  beforeEach(() => { fetchSearch.mockReset(); optionalAccess.mockReset().mockResolvedValue({status: 'anonymous'}); authRedirect.mockReset() })

  it('renders an anonymous search form without requesting an empty query', async () => {
    render(await SearchPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))
    expect(screen.getByRole('search')).toBeVisible()
    expect(screen.getByRole('searchbox', {name: 'Search AI/IP profiles and posts'})).toHaveAttribute('placeholder', 'Search AI/IP profiles and posts')
    expect(screen.getByText('Search AI/IP profiles and posts')).toHaveClass('sr-only')
    expect(fetchSearch).not.toHaveBeenCalled()
  })

  it('uses the matching Chinese AI/IP-and-posts search copy', async () => {
    render(await SearchPage({params: Promise.resolve({locale: 'zh-CN'}), searchParams: Promise.resolve({})}))
    expect(screen.getByRole('searchbox', {name: '搜索 AI/IP 资料和帖子'})).toHaveAttribute('placeholder', '搜索 AI/IP 资料和帖子')
  })

  it('requests normalized query results and renders public profiles', async () => {
    fetchSearch.mockResolvedValue({status: 'ok', data: {items: [{type: 'profile', profile}], nextCursor: null}})
    render(await SearchPage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({q: '  luna  ', category: 'ips'}),
    }))
    expect(fetchSearch).toHaveBeenCalledWith(expect.objectContaining({q: 'luna', category: 'ips'}))
    expect(screen.getByText('Luna')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Follow'})).toBeNull()
  })

  it('renders the no-results state', async () => {
    fetchSearch.mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
    render(await SearchPage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({q: 'unknown'}),
    }))
    expect(screen.getByText('No results found')).toBeVisible()
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
    expect(screen.getByRole('link', {name: 'Luna'})).toHaveAttribute('href', '/en/auth/sign-in?next=%2Fen%2Fprofiles%2F5b8ba43c-0a9e-43ec-87be-448a9e1ebf30')

    optionalAccess.mockResolvedValue({status: 'authenticated', token: 'token'})
    render(await SearchPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({q: 'luna'})}))
    expect(screen.getAllByRole('link', {name: 'Luna'}).at(-1)).toHaveAttribute('href', '/en/profiles/5b8ba43c-0a9e-43ec-87be-448a9e1ebf30')
  })
})
