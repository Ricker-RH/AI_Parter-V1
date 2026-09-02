import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {NotificationReadButton} from './NotificationReadButton.js'

const assign = vi.fn()
const {refresh} = vi.hoisted(() => ({refresh: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({refresh})}))

afterEach(() => { vi.unstubAllGlobals(); assign.mockReset(); refresh.mockReset() })

describe('NotificationReadButton', () => {
  it('sends an expired session to full-page sign in with the current safe return target', async () => {
    vi.stubGlobal('location', {assign, pathname: '/en/notifications', search: '?cursor=next'})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 401})))
    render(<NotificationReadButton errorLabel="Action failed" label="Mark read" locale="en" notificationId="11111111-1111-4111-8111-111111111111" pendingLabel="Marking" />)

    fireEvent.click(screen.getByRole('button', {name: 'Mark read'}))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/en/auth/sign-in?next=%2Fen%2Fnotifications%3Fcursor%3Dnext'))
    expect(screen.queryByText('Action failed')).toBeNull()
  })

  it('keeps non-authentication failures in place', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 503})))
    render(<NotificationReadButton errorLabel="Action failed" label="Mark read" locale="en" notificationId="11111111-1111-4111-8111-111111111111" pendingLabel="Marking" />)

    fireEvent.click(screen.getByRole('button', {name: 'Mark read'}))

    expect(await screen.findByText('Action failed')).toBeVisible()
    expect(assign).not.toHaveBeenCalled()
  })
})
