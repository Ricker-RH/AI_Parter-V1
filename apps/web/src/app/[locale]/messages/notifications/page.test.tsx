import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {access, notifications, authRedirect} = vi.hoisted(() => ({access: vi.fn(), notifications: vi.fn(), authRedirect: vi.fn()}))
vi.mock('../../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access, redirectToUserSignIn: authRedirect}))
vi.mock('../../../../lib/social-api.js', () => ({fetchNotifications: notifications}))
vi.mock('next/navigation', () => ({notFound: vi.fn()}))
import NotificationsPage from './page.js'

describe('canonical notification list route', () => {
  beforeEach(() => { access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token', viewerScope: 'viewer'}); notifications.mockReset().mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}}) })

  it('guards and renders the unified workspace at the canonical URL', async () => {
    render(await NotificationsPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))
    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/messages/notifications'})
    expect(notifications).toHaveBeenCalledWith({token: 'token'})
    expect(screen.getByRole('heading', {name: 'No notifications yet'})).toBeVisible()
  })
})
