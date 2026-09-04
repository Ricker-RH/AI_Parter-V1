import type {Notification} from '@aifans/contracts'
import {fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {afterEach, describe, expect, it, vi} from 'vitest'
import en from '../../../messages/en.json'
import {NotificationsWorkspace, updateReadMutation} from './NotificationsWorkspace.js'

const notification: Notification = {
  id: '66666666-6666-4666-8666-666666666666',
  kind: 'post_like',
  actor: {kind: 'ip', id: '44444444-4444-4444-8444-444444444444', username: 'alex', displayName: 'Alex', languages: ['en'], visualType: 'hybrid'},
  postId: '22222222-2222-4222-8222-222222222222',
  commentId: null,
  createdAt: '2026-08-31T12:07:00.000Z',
  readAt: null,
}

afterEach(() => vi.unstubAllGlobals())

describe('NotificationsWorkspace', () => {
  it('renders a projected HUMAN avatar in notification list and detail', () => {
    const humanNotification: Notification = {...notification, actor: {kind: 'human', id: '44444444-4444-4444-8444-444444444444', username: 'alex', displayName: 'Alex', avatarUrl: 'https://media.example/alex.webp'}, readAt: '2026-09-03T00:00:00.000Z'}
    const {container} = render(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [humanNotification], nextCursor: null}}} selectedId={humanNotification.id} selectedResult={{status: 'ok', data: humanNotification}} viewerScope="viewer-a"/>)
    const images = container.querySelectorAll('img[src="https://media.example/alex.webp"]')
    expect(images).toHaveLength(2)
    images.forEach(image => expect(image).toHaveAttribute('alt', ''))
  })
  it('does not let an older operation rollback a read confirmed by another operation', () => {
    let state = updateReadMutation(new Map(), notification.id, 'older', 'optimistic')
    state = updateReadMutation(state, notification.id, 'newer', 'optimistic')
    state = updateReadMutation(state, notification.id, 'newer', 'confirmed')
    state = updateReadMutation(state, notification.id, 'older', 'rollback')

    expect(state.get(notification.id)?.confirmed).toBe(true)
    expect(state.get(notification.id)?.pending.size).toBe(0)
  })
  it('keeps the canonical list and an honest empty detail in one workspace', () => {
    render(<NotificationsWorkspace labels={en} listCursor="origin" locale="en" result={{status: 'ok', data: {items: [notification], nextCursor: 'next'}}} viewerScope="viewer-a" />)

    expect(screen.getByRole('heading', {name: 'Messages'})).toBeVisible()
    expect(screen.getByRole('link', {name: 'Notifications'})).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', {name: /Alex liked your post/})).toHaveAttribute('href', `/en/messages/notifications/${notification.id}?listCursor=origin`)
    expect(screen.getByRole('heading', {name: 'Select a notification'})).toBeVisible()
    expect(screen.getByRole('link', {name: 'Load more'})).toHaveAttribute('href', '/en/messages/notifications?cursor=next')
  })

  it('marks a valid selected detail read and provides contextual target content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({readAt: '2026-09-03T00:00:00.000Z'})))
    render(<NotificationsWorkspace labels={en} listCursor="origin" locale="en" result={{status: 'ok', data: {items: [notification], nextCursor: null}}} selectedId={notification.id} selectedResult={{status: 'ok', data: notification}} viewerScope="viewer-a" />)

    const selected = screen.getByRole('link', {name: /Alex liked your post/})
    expect(selected).toHaveAttribute('aria-current', 'page')
    expect(within(selected).queryByText('Unread')).toBeNull()
    expect(screen.getByRole('link', {name: 'View post'})).toHaveAttribute('href', `/en/posts/${notification.postId}`)
    expect(screen.getByRole('link', {name: /Back/})).toHaveAttribute('href', '/en/messages/notifications?cursor=origin')
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/social/notifications/${notification.id}/read`, expect.objectContaining({method: 'PUT'})))
    await waitFor(() => expect(within(selected).queryByText('Unread')).toBeNull())
  })

  it('rolls back unread state and announces an automatic read failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 503})))
    render(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [notification], nextCursor: null}}} selectedId={notification.id} selectedResult={{status: 'ok', data: notification}} viewerScope="viewer-a" />)

    expect(await screen.findByText('Action failed. Please try again.')).toBeVisible()
    expect(within(screen.getByRole('link', {name: /Alex liked your post/})).getByText('Unread')).toBeVisible()
  })

  it('rolls back notification A when its pending automatic read is cancelled by selecting B', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>(() => undefined)))
    const notificationB: Notification = {...notification, id: '77777777-7777-4777-8777-777777777777', readAt: '2026-09-03T00:00:00.000Z'}
    const {container, rerender} = render(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [notification, notificationB], nextCursor: null}}} selectedId={notification.id} selectedResult={{status: 'ok', data: notification}} viewerScope="viewer-a" />)

    const notificationALink = () => container.querySelector<HTMLAnchorElement>(`a[href="/en/messages/notifications/${notification.id}"]`)!
    await waitFor(() => expect(within(notificationALink()).queryByText('Unread')).toBeNull())
    rerender(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [notification, notificationB], nextCursor: null}}} selectedId={notificationB.id} selectedResult={{status: 'ok', data: notificationB}} viewerScope="viewer-a" />)

    expect(within(notificationALink()).getByText('Unread')).toBeVisible()
  })

  it('keeps the new viewer operation optimistic when the viewer scope changes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>(() => undefined)))
    const {rerender} = render(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [notification], nextCursor: null}}} selectedId={notification.id} selectedResult={{status: 'ok', data: notification}} viewerScope="viewer-a" />)
    const selected = () => screen.getByRole('link', {name: /Alex liked your post/})
    await waitFor(() => expect(within(selected()).queryByText('Unread')).toBeNull())

    rerender(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [notification], nextCursor: null}}} selectedId={notification.id} selectedResult={{status: 'ok', data: notification}} viewerScope="viewer-b" />)

    await waitFor(() => expect(within(selected()).queryByText('Unread')).toBeNull())
  })

  it('retries a failed automatic read and exposes the confirmed read status', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(null, {status: 503}))
      .mockResolvedValueOnce(Response.json({readAt: '2026-09-03T00:00:00.000Z'}))
    vi.stubGlobal('fetch', request)
    const retryLabels = {...en, chat: {...en.chat, notificationReadRetry: 'Retry marking as read'}}
    render(<NotificationsWorkspace labels={retryLabels} locale="en" result={{status: 'ok', data: {items: [notification], nextCursor: null}}} selectedId={notification.id} selectedResult={{status: 'ok', data: notification}} viewerScope="viewer-a" />)

    fireEvent.click(await screen.findByRole('button', {name: 'Retry marking as read'}))

    expect(await screen.findByText('Read')).toBeVisible()
    expect(within(screen.getByRole('link', {name: /Alex liked your post/})).queryByText('Unread')).toBeNull()
  })

  it('styles an automatic read confirmation like an authoritative server read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({readAt: '2026-09-03T00:00:00.000Z'})))
    const {unmount} = render(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [notification], nextCursor: null}}} selectedId={notification.id} selectedResult={{status: 'ok', data: notification}} viewerScope="viewer-a" />)
    const automaticClass = (await screen.findByText('Read')).className
    unmount()

    const serverRead = {...notification, readAt: '2026-09-03T00:00:00.000Z'}
    render(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [serverRead], nextCursor: null}}} selectedId={serverRead.id} selectedResult={{status: 'ok', data: serverRead}} viewerScope="viewer-a" />)

    expect(automaticClass).not.toBe('')
    expect(automaticClass).toBe(screen.getByText('Read').className)
  })

  it.each(['comment', 'reply', 'comment_like'] as const)('links %s notifications to their stable comment fragment', (kind) => {
    const targeted: Notification = {...notification, kind, commentId: '33333333-3333-4333-8333-333333333333', readAt: '2026-09-03T00:00:00.000Z'}
    render(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [targeted], nextCursor: null}}} selectedId={targeted.id} selectedResult={{status: 'ok', data: targeted}} viewerScope="viewer-a" />)

    expect(screen.getByRole('link', {name: 'View post'})).toHaveAttribute('href', `/en/posts/${targeted.postId}#comment-${targeted.commentId}`)
  })

  it('falls back safely when a notification target is incomplete', () => {
    const missingComment: Notification = {...notification, kind: 'comment', commentId: null, readAt: '2026-09-03T00:00:00.000Z'}
    const {rerender} = render(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [missingComment], nextCursor: null}}} selectedId={missingComment.id} selectedResult={{status: 'ok', data: missingComment}} viewerScope="viewer-a" />)
    expect(screen.getByRole('link', {name: 'View post'})).toHaveAttribute('href', `/en/posts/${missingComment.postId}`)

    const missingPost: Notification = {...missingComment, postId: null}
    rerender(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [missingPost], nextCursor: null}}} selectedId={missingPost.id} selectedResult={{status: 'ok', data: missingPost}} viewerScope="viewer-a" />)
    expect(screen.queryByRole('link', {name: 'View post'})).toBeNull()
  })

  it('moves focus to each newly selected mobile notification detail', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({matches: true}))
    const notificationB: Notification = {...notification, id: '77777777-7777-4777-8777-777777777777', readAt: '2026-09-03T00:00:00.000Z'}
    const readNotification = {...notification, readAt: '2026-09-03T00:00:00.000Z'}
    const {rerender} = render(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [readNotification, notificationB], nextCursor: null}}} selectedId={readNotification.id} selectedResult={{status: 'ok', data: readNotification}} viewerScope="viewer-a" />)
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(1))

    rerender(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [readNotification, notificationB], nextCursor: null}}} selectedId={notificationB.id} selectedResult={{status: 'ok', data: notificationB}} viewerScope="viewer-a" />)

    await waitFor(() => expect(focus).toHaveBeenCalledTimes(2))
    focus.mockRestore()
  })

  it('moves focus when switching between unavailable mobile notification details', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({matches: true}))
    const notificationB: Notification = {...notification, id: '77777777-7777-4777-8777-777777777777'}
    const list = {status: 'ok' as const, data: {items: [notification, notificationB], nextCursor: null}}
    const {rerender} = render(<NotificationsWorkspace labels={en} locale="en" result={list} selectedId={notification.id} selectedResult={{status: 'unavailable'}} viewerScope="viewer-a" />)
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(1))

    rerender(<NotificationsWorkspace labels={en} locale="en" result={list} selectedId={notificationB.id} selectedResult={{status: 'unavailable'}} viewerScope="viewer-a" />)

    await waitFor(() => expect(focus).toHaveBeenCalledTimes(2))
    focus.mockRestore()
  })

  it('uses profile context for a follow notification and isolates unavailable detail', () => {
    const follow = {...notification, kind: 'follow' as const, postId: null}
    const {rerender} = render(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [follow], nextCursor: null}}} selectedId={follow.id} selectedResult={{status: 'ok', data: {...follow, readAt: '2026-09-03T00:00:00.000Z'}}} viewerScope="viewer-a" />)
    expect(screen.getByRole('link', {name: 'View profile'})).toHaveAttribute('href', `/en/profiles/${follow.actor?.id}`)
    rerender(<NotificationsWorkspace labels={en} locale="en" result={{status: 'ok', data: {items: [follow], nextCursor: null}}} selectedId={follow.id} selectedResult={{status: 'unavailable'}} viewerScope="viewer-a" />)
    expect(screen.getByRole('alert')).toHaveTextContent('This notification is unavailable right now.')
    expect(screen.getByRole('link', {name: /Alex followed you/})).toBeVisible()
  })

  it('encodes a stable responsive and accessible two-pane CSS contract', () => {
    const root = process.cwd().endsWith('/apps/web') ? 'src' : 'apps/web/src'
    const css = readFileSync(`${root}/components/chat/MessagesWorkspace.module.css`, 'utf8')
    const baseRules = css.slice(0, css.indexOf('@media (max-width: 699px)'))
    const desktopRules = css.slice(css.indexOf('@media (min-width: 700px)'))
    expect(css).toMatch(/\.workspace\s*\{[^}]*overflow-x:\s*hidden/)
    expect(css).toMatch(/@media \(min-width: 700px\)[\s\S]*grid-template-columns:\s*minmax\(300px, 380px\) minmax\(0, 1fr\)/)
    expect(css).toMatch(/@media \(max-width: 699px\)[\s\S]*data-selected="true"[^}]*\.listPane[^}]*display:\s*none/)
    expect(baseRules).toMatch(/\.sectionHeader \{[^}]*display: grid/)
    expect(baseRules).not.toMatch(/\.sectionHeader \{[^}]*border-bottom/)
    expect(baseRules).not.toMatch(/\.listPane \{[^}]*border-bottom/)
    expect(desktopRules).toMatch(/\.listPane \{[^}]*border-right: 1px solid var\(--shell-border\)/)
    expect(css).toMatch(/focus-visible/)
    expect(css).toMatch(/safe-area-inset-bottom/)
  })
})
