import {encodeNotificationCursor, type Notification} from '@aifans/contracts'
import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {access, notifications, notification, authRedirect, notFound} = vi.hoisted(() => ({access: vi.fn(), notifications: vi.fn(), notification: vi.fn(), authRedirect: vi.fn(), notFound: vi.fn()}))
vi.mock('../../../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access, redirectToUserSignIn: authRedirect}))
vi.mock('../../../../../lib/social-api.js', () => ({fetchNotifications: notifications, fetchNotification: notification}))
vi.mock('next/navigation', () => ({notFound}))
import NotificationPage from './page.js'

const id = '66666666-6666-4666-8666-666666666666'
const item: Notification = {id, kind: 'post_like', actor: {kind: 'human', id: '44444444-4444-4444-8444-444444444444', username: 'alex', displayName: 'Alex'}, postId: '22222222-2222-4222-8222-222222222222', commentId: null, createdAt: '2026-08-31T12:07:00.000Z', readAt: '2026-09-03T00:00:00.000Z'}
const listCursor = encodeNotificationCursor({v: 1, kind: 'notifications', createdAt: item.createdAt, id})

describe('canonical notification detail route', () => {
  beforeEach(() => { access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token', viewerScope: 'viewer'}); notifications.mockReset().mockResolvedValue({status: 'ok', data: {items: [item], nextCursor: null}}); notification.mockReset().mockResolvedValue({status: 'ok', data: item}); notFound.mockReset() })

  it('loads list and selected detail in parallel with a preserved list cursor', async () => {
    render(await NotificationPage({params: Promise.resolve({locale: 'en', notificationId: id}), searchParams: Promise.resolve({listCursor})}))
    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: `/en/messages/notifications/${id}?listCursor=${encodeURIComponent(listCursor)}`})
    expect(notifications).toHaveBeenCalledWith({cursor: listCursor, token: 'token'})
    expect(notification).toHaveBeenCalledWith(id, {token: 'token'})
    expect(screen.getByRole('heading', {name: 'Notification'})).toBeVisible()
  })

  it('rejects malformed ids before authentication or data reads', async () => {
    await NotificationPage({params: Promise.resolve({locale: 'en', notificationId: 'bad'}), searchParams: Promise.resolve({})})
    expect(notFound).toHaveBeenCalled()
    expect(access).not.toHaveBeenCalled()
    expect(notifications).not.toHaveBeenCalled()
  })
})
