import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {access, authRedirect, fetchFeed} = vi.hoisted(() => ({access: vi.fn(), authRedirect: vi.fn(), fetchFeed: vi.fn(async () => ({status: 'ok', data: {items: [], nextCursor: null}}))}))
vi.mock('../../lib/request-cookie.js', () => ({requestCookie: vi.fn(async () => undefined)}))
vi.mock('../../lib/social-api.js', () => ({
  fetchFeed,
}))
vi.mock('../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access, redirectToUserSignIn: authRedirect}))

import HomePage from './page.js'

describe('home feed query navigation', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    authRedirect.mockReset()
    fetchFeed.mockClear()
  })
  it('preserves repeated parameters and removes the stale cursor from tab links', async () => {
    render(await HomePage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({
        campaign: ['launch', 'return'],
        cursor: 'stale',
        visualType: 'anime',
      }),
    }))

    expect(screen.getByRole('tab', {name: 'Following'})).toHaveAttribute(
      'href',
      '/en?campaign=launch&campaign=return&visualType=anime&feed=following',
    )
    expect(screen.getByRole('tab', {name: 'Realistic'})).toHaveAttribute(
      'href',
      '/en?campaign=launch&campaign=return&visualType=realistic',
    )
    expect(screen.getAllByRole('tab').every((tab) => !tab.getAttribute('href')?.includes('cursor='))).toBe(true)
  })

  it('guards Following before it requests a personalized feed', async () => {
    access.mockResolvedValue({status: 'unavailable'})

    await HomePage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({feed: 'following', visualType: 'anime'}),
    })

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en?feed=following&visualType=anime'})
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
})
