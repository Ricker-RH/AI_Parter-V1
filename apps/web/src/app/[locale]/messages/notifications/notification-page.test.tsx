import {beforeEach, describe, expect, it, vi} from 'vitest'

const {access, authRedirect, messages, notification, notifications, workspace} = vi.hoisted(() => ({
  access: vi.fn(),
  authRedirect: vi.fn(),
  messages: vi.fn(),
  notification: vi.fn(),
  notifications: vi.fn(),
  workspace: vi.fn(() => null),
}))

vi.mock('../../../../i18n/config.js', () => ({getMessages: messages}))
vi.mock('../../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access, redirectToUserSignIn: authRedirect}))
vi.mock('../../../../lib/social-api.js', () => ({fetchNotification: notification, fetchNotifications: notifications}))
vi.mock('../../../../components/chat/NotificationsWorkspace.js', () => ({NotificationsWorkspace: workspace}))

import {renderNotificationWorkspace} from './notification-page.js'

const authenticated = {status: 'authenticated' as const, token: 'token', viewerScope: 'viewer'}
const labels = {notifications: {title: 'Notifications'}}

describe('renderNotificationWorkspace', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue(authenticated)
    authRedirect.mockReset()
    messages.mockReset().mockResolvedValue(labels)
    notification.mockReset().mockResolvedValue(undefined)
    notifications.mockReset().mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
    workspace.mockClear()
  })

  it('starts authentication and messages loading in parallel, then waits for both', async () => {
    let resolveAccess!: (value: typeof authenticated) => void
    let resolveMessages!: (value: typeof labels) => void
    access.mockImplementation(() => new Promise((resolve) => { resolveAccess = resolve }))
    messages.mockImplementation(() => new Promise((resolve) => { resolveMessages = resolve }))

    const rendering = renderNotificationWorkspace({locale: 'en'})

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/messages/notifications'})
    expect(messages).toHaveBeenCalledWith('en')
    expect(notifications).not.toHaveBeenCalled()

    resolveAccess(authenticated)
    await Promise.resolve()
    expect(notifications).not.toHaveBeenCalled()

    resolveMessages(labels)
    await rendering
    expect(notifications).toHaveBeenCalledWith({token: 'token'})
  })

  it('propagates authentication failures while still starting messages loading', async () => {
    const failure = new Error('authentication failed')
    access.mockRejectedValue(failure)

    await expect(renderNotificationWorkspace({locale: 'en'})).rejects.toBe(failure)

    expect(messages).toHaveBeenCalledWith('en')
    expect(notifications).not.toHaveBeenCalled()
  })

  it('preserves sign-in redirects from an auth-required notification response', async () => {
    const redirect = new Error('NEXT_REDIRECT')
    notifications.mockResolvedValue({status: 'auth-required'})
    authRedirect.mockImplementation(() => { throw redirect })

    await expect(renderNotificationWorkspace({locale: 'en'})).rejects.toBe(redirect)

    expect(authRedirect).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/messages/notifications'})
  })
})
