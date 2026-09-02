import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {access, authRedirect, fetchBookmarks, fetchLiked, fetchNotifications} = vi.hoisted(() => ({access: vi.fn(), authRedirect: vi.fn(), fetchBookmarks: vi.fn(), fetchLiked: vi.fn(), fetchNotifications: vi.fn()}))
vi.mock('../../../lib/social-api.js', () => ({fetchBookmarks, fetchLiked, fetchNotifications}))
vi.mock('../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access, redirectToUserSignIn: authRedirect}))

import ActivityPage from './page.js'

describe('activity center', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    authRedirect.mockReset()
    fetchBookmarks.mockReset().mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
    fetchLiked.mockReset().mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
    fetchNotifications.mockReset().mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
  })

  it('loads only the selected private dataset and keeps its tab in the return path', async () => {
    render(await ActivityPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({tab: 'liked', cursor: 'opaque'})}))
    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/activity?tab=liked&cursor=opaque'})
    expect(fetchLiked).toHaveBeenCalledWith({cursor: 'opaque', token: 'token'})
    expect(fetchBookmarks).not.toHaveBeenCalled()
    expect(fetchNotifications).not.toHaveBeenCalled()
    const liked = screen.getByRole('link', {name: 'Liked'})
    expect(liked).toHaveAttribute('aria-current', 'page')
    expect(liked).toHaveAttribute('href', '/en/activity?tab=liked')
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('defaults to Liked and ignores repeated activity query values', async () => {
    render(await ActivityPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({tab: ['saved', 'liked'], cursor: ['one', 'two']})}))
    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/activity?tab=liked'})
    expect(fetchLiked).toHaveBeenCalledWith({cursor: undefined, token: 'token'})
    expect(fetchBookmarks).not.toHaveBeenCalled()
    expect(fetchNotifications).not.toHaveBeenCalled()
    expect(screen.getByRole('link', {name: 'Liked'})).toHaveAttribute('aria-current', 'page')
  })

  it('does not read any activity dataset for an anonymous visitor', async () => {
    access.mockResolvedValue({status: 'unavailable'})
    await ActivityPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({tab: 'saved'})})
    expect(fetchLiked).not.toHaveBeenCalled()
    expect(fetchBookmarks).not.toHaveBeenCalled()
    expect(fetchNotifications).not.toHaveBeenCalled()
  })

  it('redirects a stale Saved session with its independent cursor', async () => {
    fetchBookmarks.mockResolvedValue({status: 'auth-required'})
    await ActivityPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({tab: 'saved', cursor: 'opaque'})})
    expect(authRedirect).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/activity?tab=saved&cursor=opaque'})
    expect(fetchNotifications).not.toHaveBeenCalled()
  })
})
