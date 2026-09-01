import {render, screen, within} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {access, optionalAccess, authRedirect, fetchFeed} = vi.hoisted(() => ({access: vi.fn(), optionalAccess: vi.fn(), authRedirect: vi.fn(), fetchFeed: vi.fn(async () => ({status: 'ok', data: {items: [], nextCursor: null}}))}))
vi.mock('../../lib/request-cookie.js', () => ({requestCookie: vi.fn(async () => undefined)}))
vi.mock('../../lib/social-api.js', () => ({
  fetchFeed,
}))
vi.mock('../../lib/auth/access-policy.js', () => ({getOptionalPageAccess: optionalAccess, requireAuthenticatedPage: access, redirectToUserSignIn: authRedirect}))

import HomePage from './page.js'

describe('home feed query navigation', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    optionalAccess.mockReset().mockResolvedValue({status: 'anonymous'})
    authRedirect.mockReset()
    fetchFeed.mockClear()
  })
  it('preserves repeated parameters and removes legacy visual filters and stale cursors from tab links', async () => {
    render(await HomePage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({
        campaign: ['launch', 'return'],
        cursor: 'stale',
        visualType: 'anime',
      }),
    }))

    const feedNavigation = screen.getByRole('navigation', {name: 'Home'})
    expect(within(feedNavigation).getByRole('link', {name: 'Following'})).toHaveAttribute('href', '/en?campaign=launch&campaign=return&feed=following')
    expect(screen.queryByText('Anime')).toBeNull()
    expect(within(feedNavigation).getAllByRole('link').every((link) => !link.getAttribute('href')?.includes('cursor='))).toBe(true)
    expect(within(feedNavigation).getAllByRole('link').every((link) => !link.getAttribute('href')?.includes('visualType='))).toBe(true)
  })

  it('ignores a legacy visualType query and fetches the unfiltered feed', async () => {
    await HomePage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({visualType: 'hybrid'}),
    })

    expect(fetchFeed).toHaveBeenCalledWith({kind: 'for_you', locale: 'en'})
  })

  it('guards Following before it requests a personalized feed', async () => {
    access.mockResolvedValue({status: 'unavailable'})

    await HomePage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({feed: 'following', visualType: 'anime'}),
    })

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en?feed=following'})
    expect(fetchFeed).not.toHaveBeenCalled()
  })

  it('redirects to sign in when the following feed invalidates a previously valid session', async () => {
    fetchFeed.mockResolvedValue({status: 'auth-required'} as never)

    await HomePage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({feed: 'following'}),
    })

    expect(authRedirect).toHaveBeenCalledWith({locale: 'en', returnTo: '/en?feed=following'})
  })

  it('reuses the guarded token for Following while anonymous For You still fetches normally', async () => {
    await HomePage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({feed: 'following'}),
    })
    expect(fetchFeed).toHaveBeenLastCalledWith(expect.objectContaining({kind: 'following', token: 'token'}))

    fetchFeed.mockClear()
    access.mockClear()
    access.mockResolvedValue({status: 'unavailable'})
    await HomePage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({}),
    })
    expect(fetchFeed).toHaveBeenCalledWith(expect.objectContaining({kind: 'for_you'}))
    expect(access).not.toHaveBeenCalled()
  })

  it('passes anonymous For You relationship projections as read-only capabilities', async () => {
    render(await HomePage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))

    expect(optionalAccess).toHaveBeenCalledOnce()
    expect(fetchFeed).toHaveBeenCalledWith(expect.objectContaining({kind: 'for_you'}))
    expect(screen.queryByRole('button', {name: 'Like'})).toBeNull()
    expect(screen.getByRole('heading', {name: 'Home'})).toHaveClass('home-title')
    expect(screen.getByRole('navigation', {name: 'Home'})).toHaveClass('mobile-feed-tabs')
  })
})
