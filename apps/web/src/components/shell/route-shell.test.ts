import {describe, expect, it} from 'vitest'
import {isActiveChatRoute, resolveShellKind, shouldShowFloatingCreatorAction} from './route-shell.js'

it('limits active chat state to the current AI or HUMAN conversation URL', () => {
  const id = '33333333-3333-4333-8333-333333333333'
  expect(isActiveChatRoute(`/en/messages/${id}`, null)).toBe(true)
  expect(isActiveChatRoute('/zh-CN/messages', id)).toBe(true)
  expect(isActiveChatRoute('/en/messages', null)).toBe(false)
  expect(isActiveChatRoute('/en/messages/notifications', id)).toBe(false)
  expect(isActiveChatRoute(`/en/messages/notifications/${id}`, null)).toBe(false)
  expect(isActiveChatRoute('/en/profile', id)).toBe(false)
  expect(isActiveChatRoute('/en/messages', 'invalid')).toBe(false)
})

describe('route shell resolver', () => {
  it.each([
    ['/en', 'public'],
    ['/en/auth/sign-in', 'auth'],
    ['/en/messages', 'messages'],
    ['/en/messages/notifications', 'messages'],
    ['/en/messages/notifications/66666666-6666-4666-8666-666666666666', 'messages'],
    ['/en/notifications', 'messages'],
    ['/en/creator', 'creator'],
    ['/en/admin', 'admin'],
  ] as const)('resolves %s as %s', (pathname, shell) => {
    expect(resolveShellKind(pathname)).toBe(shell)
  })

  it('uses segment boundaries so child and query-like path text cannot select a special shell', () => {
    expect(resolveShellKind('/en/administer')).toBe('public')
    expect(resolveShellKind('/en/creatorial')).toBe('public')
    expect(resolveShellKind('/en/admin?source=nav')).toBe('admin')
    expect(resolveShellKind('/en?next=/admin')).toBe('public')
  })
})

describe('floating creator action route policy', () => {
  it.each([
    '/en', '/zh-CN', '/en/channels', '/zh-CN/channels', '/en/messages', '/zh-CN/messages',
  ])('shows on the primary route %s', (pathname) => {
    expect(shouldShowFloatingCreatorAction(pathname)).toBe(true)
  })

  it.each([
    '/en/posts/post-1',
    '/en/channels/channel-1',
    '/en/channels/channel-1/profiles',
    '/en/messages/conversation-1',
    '/en/profiles/profile-1',
    '/en/profile',
    '/en/activity',
    '/en/creator',
    '/en/notifications',
    '/en/search',
  ])('hides on the secondary route %s', (pathname) => {
    expect(shouldShowFloatingCreatorAction(pathname)).toBe(false)
  })

  it('ignores a primary route mentioned only in query or hash text', () => {
    expect(shouldShowFloatingCreatorAction('/en/profile?next=/en/channels')).toBe(false)
    expect(shouldShowFloatingCreatorAction('/en/profile#/en/messages')).toBe(false)
  })
})
