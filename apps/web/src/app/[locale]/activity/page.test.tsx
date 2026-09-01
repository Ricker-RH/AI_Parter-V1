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

  it('does not read any activity dataset for an anonymous visitor', async () => {
    access.mockResolvedValue({status: 'unavailable'})
    await ActivityPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({tab: 'saved'})})
    expect(fetchLiked).not.toHaveBeenCalled()
    expect(fetchBookmarks).not.toHaveBeenCalled()
    expect(fetchNotifications).not.toHaveBeenCalled()
  })

  it('redirects a stale notification session with its independent cursor', async () => {
    fetchNotifications.mockResolvedValue({status: 'auth-required'})
    await ActivityPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({tab: 'notifications', cursor: 'opaque'})})
    expect(authRedirect).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/activity?tab=notifications&cursor=opaque'})
  })
})
