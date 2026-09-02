import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {NotificationReadButton} from './NotificationReadButton.js'
import {readFileSync} from 'node:fs'

const assign = vi.fn()
const {refresh} = vi.hoisted(() => ({refresh: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({refresh})}))

afterEach(() => { vi.unstubAllGlobals(); assign.mockReset(); refresh.mockReset() })

describe('NotificationReadButton', () => {
  it('keeps identity cancellation out of render', () => {
    const source = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/social/NotificationReadButton.tsx' : 'apps/web/src/components/social/NotificationReadButton.tsx', 'utf8')
    expect(source).toContain('<ScopedNotificationReadButton key={scope}')
    expect(source).not.toContain('controller.current?.abort();controller.current=null;setPending')
  })

  it('optimistically removes the unread action and commits the strict read timestamp without refreshing', async () => {
    let resolve!: (response: Response) => void
    const onRead = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done })))
    render(<NotificationReadButton errorLabel="Action failed" label="Mark read" locale="en" notificationId="11111111-1111-4111-8111-111111111111" onRead={onRead} pendingLabel="Marking" viewerScope="viewer-a" />)

    fireEvent.click(screen.getByRole('button', {name: 'Mark read'}))
    expect(screen.queryByRole('button', {name: 'Mark read'})).toBeNull()
    resolve(new Response(JSON.stringify({readAt: '2026-09-02T12:00:00.000Z'}), {status: 200}))

    await waitFor(() => expect(onRead).toHaveBeenCalledWith('2026-09-02T12:00:00.000Z'))
    expect(refresh).not.toHaveBeenCalled()
  })

  it('sends an expired session to full-page sign in with the current safe return target', async () => {
    vi.stubGlobal('location', {assign, pathname: '/en/notifications', search: '?cursor=next'})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 401})))
    render(<NotificationReadButton errorLabel="Action failed" label="Mark read" locale="en" notificationId="11111111-1111-4111-8111-111111111111" pendingLabel="Marking" viewerScope="viewer-a" />)

    fireEvent.click(screen.getByRole('button', {name: 'Mark read'}))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/en/auth/sign-in?next=%2Fen%2Fnotifications%3Fcursor%3Dnext'))
    expect(screen.queryByText('Action failed')).toBeNull()
  })

  it('keeps non-authentication failures in place', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 503})))
    render(<NotificationReadButton errorLabel="Action failed" label="Mark read" locale="en" notificationId="11111111-1111-4111-8111-111111111111" pendingLabel="Marking" viewerScope="viewer-a" />)

    fireEvent.click(screen.getByRole('button', {name: 'Mark read'}))

    expect(await screen.findByText('Action failed')).toBeVisible()
    expect(assign).not.toHaveBeenCalled()
  })

  it('ignores an in-flight read response after the viewer scope changes', async () => {
    let resolve!: (response: Response) => void
    const onRead = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done })))
    const {rerender} = render(<NotificationReadButton errorLabel="Action failed" label="Mark read" locale="en" notificationId="11111111-1111-4111-8111-111111111111" onRead={onRead} pendingLabel="Marking" viewerScope="viewer-a" />)
    fireEvent.click(screen.getByRole('button', {name: 'Mark read'}))
    rerender(<NotificationReadButton errorLabel="Action failed" label="Mark read" locale="en" notificationId="11111111-1111-4111-8111-111111111111" onRead={onRead} pendingLabel="Marking" viewerScope="viewer-b" />)
    resolve(new Response(JSON.stringify({readAt: '2026-09-02T12:00:00.000Z'}), {status: 200}))
    await Promise.resolve()
    expect(onRead).not.toHaveBeenCalled()
    expect(screen.getByRole('button', {name: 'Mark read'})).toBeEnabled()
  })
})
