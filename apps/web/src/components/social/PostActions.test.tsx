import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {PostActions} from './PostActions.js'

const {refresh, replace} = vi.hoisted(() => ({refresh: vi.fn(), replace: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({refresh, replace})}))

afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); replace.mockReset() })

describe('PostActions', () => {
  it('waits for the real mutation before updating pressed state and never invents a count', async () => {
    let finish!: (value: Response) => void
    const request = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { finish = resolve }))
    vi.stubGlobal('fetch', request)
    render(<PostActions authorId="11111111-1111-4111-8111-111111111111" bookmarked={false} labels={{bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}} liked={false} locale="en" postId="22222222-2222-4222-8222-222222222222" followsAuthor={false} />)

    fireEvent.click(screen.getByRole('button', {name: 'Like'}))

    expect(screen.getByRole('button', {name: 'Like'})).toBeDisabled()
    expect(request).toHaveBeenCalledWith('/api/social/posts/22222222-2222-4222-8222-222222222222/like', {credentials: 'include', method: 'PUT'})
    finish(new Response(JSON.stringify({created: true}), {status: 200}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Unlike'})).toHaveAttribute('aria-pressed', 'true'))
    expect(refresh).toHaveBeenCalledOnce()
    expect(document.body).not.toHaveTextContent(/5 likes/)
  })

  it('announces mutation errors accessibly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({code: 'SOCIAL_UNAVAILABLE'}), {status: 503})))
    render(<PostActions authorId="11111111-1111-4111-8111-111111111111" bookmarked={false} labels={{bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}} liked={false} locale="en" postId="22222222-2222-4222-8222-222222222222" followsAuthor={false} />)
    fireEvent.click(screen.getByRole('button', {name: 'Bookmark'}))
    expect(await screen.findByRole('status')).toHaveTextContent('Action failed.')
  })

  it('sends an expired session to localized full-page sign in without retrying the mutation', async () => {
    window.history.replaceState({}, '', '/en/posts/22222222-2222-4222-8222-222222222222?commentCursor=next')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 401})))
    render(<PostActions authorId="11111111-1111-4111-8111-111111111111" bookmarked={false} labels={{bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}} liked={false} locale="en" postId="22222222-2222-4222-8222-222222222222" followsAuthor={false} />)

    fireEvent.click(screen.getByRole('button', {name: 'Like'}))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/en/auth/sign-in?next=%2Fen%2Fposts%2F22222222-2222-4222-8222-222222222222%3FcommentCursor%3Dnext'))
  })
})
