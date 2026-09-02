import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {access, notifications} = vi.hoisted(() => ({access: vi.fn(), notifications: vi.fn()}))
vi.mock('../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access, redirectToUserSignIn: vi.fn()}))
vi.mock('../../../lib/social-api.js', () => ({fetchNotifications: notifications}))
vi.mock('next/navigation', () => ({notFound: vi.fn()}))
import NotificationsPage from './page.js'

describe('notifications inside Messages', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    notifications.mockReset().mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
  })

  it('uses the shared Messages heading and tabs while preserving the notifications read', async () => {
    render(await NotificationsPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))
    expect(notifications).toHaveBeenCalledWith({token: 'token'})
    expect(screen.getByRole('heading', {name: 'Messages'})).toBeVisible()
    expect(screen.getByRole('link', {name: 'Chats'})).toHaveAttribute('href', '/en/messages')
    expect(screen.getByRole('link', {name: 'Notifications'})).toHaveAttribute('href', '/en/notifications')
    expect(screen.getByRole('link', {name: 'Notifications'})).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', {name: 'No notifications yet'})).toBeVisible()
  })

  it('ignores duplicate cursor values instead of passing arrays to notification reads', async () => {
    render(await NotificationsPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({cursor: ['first', 'second']})}))
    expect(notifications).toHaveBeenCalledWith({token: 'token'})
  })
})
