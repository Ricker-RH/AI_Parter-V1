import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {access, authRedirect, fetchLiked} = vi.hoisted(() => ({access: vi.fn(), authRedirect: vi.fn(), fetchLiked: vi.fn()}))
vi.mock('../../../lib/social-api.js', () => ({fetchLiked}))
vi.mock('../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access, redirectToUserSignIn: authRedirect}))

import LikedPage from './page.js'

describe('liked page', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    authRedirect.mockReset()
    fetchLiked.mockReset().mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
  })

  it('requires auth before reading the owner liked dataset and preserves the cursor', async () => {
    render(await LikedPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({cursor: 'opaque'})}))
    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/liked?cursor=opaque'})
    expect(fetchLiked).toHaveBeenCalledWith({cursor: 'opaque', token: 'token'})
    expect(screen.getByRole('heading', {name: 'Liked'})).toBeVisible()
    expect(document.querySelector('.collection-page')).toBeTruthy()
    expect(document.querySelector('[data-social-surface-viewport]')).toBeTruthy()
  })

  it('offers a real return to Home when the liked collection is empty', async () => {
    render(await LikedPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))

    expect(screen.getByRole('link', {name: 'Home'})).toHaveAttribute('href', '/en')
  })

  it('does not read private likes for an anonymous visitor', async () => {
    access.mockResolvedValue({status: 'unavailable'})
    await LikedPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})})
    expect(fetchLiked).not.toHaveBeenCalled()
  })

  it('redirects a stale session without rendering private content', async () => {
    fetchLiked.mockResolvedValue({status: 'auth-required'})
    await LikedPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({cursor: 'opaque'})})
    expect(authRedirect).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/liked?cursor=opaque'})
  })
})
