import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {ProfileFollowButton} from './ProfileFollowButton.js'

const {refresh, replace} = vi.hoisted(() => ({refresh: vi.fn(), replace: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({refresh, replace})}))

const labels = {follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed'}
const profileId = '11111111-1111-4111-8111-111111111111'

describe('ProfileFollowButton', () => {
  it('keeps the relationship action pending until a successful mutation completes', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done })))
    render(<ProfileFollowButton following={false} labels={labels} locale="en" profileId={profileId}/>)

    fireEvent.click(screen.getByRole('button', {name: 'Follow'}))
    expect(screen.getByRole('button', {name: 'Follow'})).toBeDisabled()
    expect(screen.getByRole('button', {name: 'Follow'})).toHaveAttribute('aria-busy', 'true')
    resolve(new Response(null, {status: 204}))

    expect(await screen.findByRole('button', {name: 'Following'})).toHaveAttribute('aria-pressed', 'true')
    expect(refresh).toHaveBeenCalled()
  })

  it('routes a stale session to localized sign in without weakening the same-origin mutation', async () => {
    window.history.replaceState({}, '', '/en/posts/22222222-2222-4222-8222-222222222222?commentCursor=next')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 401})))
    render(<ProfileFollowButton following={false} labels={labels} locale="en" profileId={profileId}/>)

    fireEvent.click(screen.getByRole('button', {name: 'Follow'}))

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/en/auth/sign-in?next=%2Fen%2Fposts%2F22222222-2222-4222-8222-222222222222%3FcommentCursor%3Dnext'))
    expect(fetch).toHaveBeenCalledWith(`/api/social/profiles/${profileId}/follow`, expect.objectContaining({method: 'PUT', credentials: 'include', signal: expect.any(AbortSignal)}))
  })

  it('restores the control and announces a failed mutation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 500})))
    render(<ProfileFollowButton following labels={labels} locale="en" profileId={profileId}/>)

    fireEvent.click(screen.getByRole('button', {name: 'Following'}))

    expect(await screen.findByText('Action failed')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Following'})).toBeEnabled()
    expect(fetch).toHaveBeenCalledWith(`/api/social/profiles/${profileId}/follow`, expect.objectContaining({method: 'DELETE', credentials: 'include', signal: expect.any(AbortSignal)}))
  })

  it('syncs new identity props and ignores a completed mutation for the previous profile', async () => {
    let resolve!: (response: Response) => void
    const request = vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done }))
    const onFollowingChange = vi.fn()
    vi.stubGlobal('fetch', request)
    const {rerender} = render(<ProfileFollowButton following={false} labels={labels} locale="en" onFollowingChange={onFollowingChange} profileId={profileId}/>)
    fireEvent.click(screen.getByRole('button', {name: 'Follow'}))
    expect(screen.getByRole('button', {name: 'Follow'})).toBeDisabled()

    const nextProfileId = '77777777-7777-4777-8777-777777777777'
    rerender(<ProfileFollowButton following labels={labels} locale="en" onFollowingChange={onFollowingChange} profileId={nextProfileId}/>)
    expect(screen.getByRole('button', {name: 'Following'})).toBeEnabled()
    resolve(new Response(null, {status: 204}))

    await vi.waitFor(() => expect(onFollowingChange).not.toHaveBeenCalled())
    expect(screen.getByRole('button', {name: 'Following'})).toBeEnabled()
  })
})
