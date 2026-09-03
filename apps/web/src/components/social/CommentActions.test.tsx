import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {CommentActions} from './CommentActions.js'

const {prefetch, replace} = vi.hoisted(() => ({prefetch: vi.fn(), replace: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({prefetch, replace})}))

const commentId = '33333333-3333-4333-8333-333333333333'
const postId = '22222222-2222-4222-8222-222222222222'
const labels = {bookmark: 'Bookmark', comments: 'Comments', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', reply: 'Reply', share: 'Share', unlike: 'Unlike'}
const counts = {bookmarkCount: 2, likeCount: 4, replyCount: 3, shareCount: 5}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return {promise, resolve}
}

afterEach(() => { vi.unstubAllGlobals(); prefetch.mockReset(); replace.mockReset() })

describe('CommentActions', () => {
  it('renders four authoritative metrics and selects the exact reply target', () => {
    const onReply = vi.fn()
    render(<CommentActions {...counts} bookmarked={false} canMutate labels={labels} liked={false} locale="en" onReply={onReply} postId={postId} commentId={commentId} viewerScope="viewer-a" />)

    expect(screen.getByRole('button', {name: 'Like 4'})).toHaveTextContent('4')
    expect(screen.getByRole('button', {name: 'Reply 3'})).toHaveTextContent('3')
    expect(screen.getByRole('button', {name: 'Bookmark 2'})).toHaveTextContent('2')
    expect(screen.getByRole('button', {name: 'Share 5'})).toHaveTextContent('5')
    fireEvent.click(screen.getByRole('button', {name: 'Reply 3'}))
    expect(onReply).toHaveBeenCalledOnce()
  })

  it('uses locale-aware compact visible counts without changing authoritative labels', () => {
    render(<CommentActions bookmarkCount={8_765_432} bookmarked={false} canMutate commentId={commentId} labels={labels} likeCount={9_876_543} liked={false} locale="en" onReply={() => undefined} postId={postId} replyCount={7_654_321} shareCount={6_543_210} viewerScope="viewer-a" />)

    expect(screen.getByRole('button', {name: 'Like 9,876,543'})).toHaveTextContent('9.9M')
    expect(screen.getByRole('button', {name: 'Reply 7,654,321'})).toHaveTextContent('7.7M')
    expect(screen.getByRole('button', {name: 'Bookmark 8,765,432'})).toHaveTextContent('8.8M')
    expect(screen.getByRole('button', {name: 'Share 6,543,210'})).toHaveTextContent('6.5M')
  })

  it('optimistically mutates comment relationships and rolls back only the failed action', async () => {
    const like = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/like') ? like.promise : Promise.resolve(Response.json({created: true}))))
    render(<CommentActions {...counts} bookmarked={false} canMutate labels={labels} liked={false} locale="en" onReply={() => undefined} postId={postId} commentId={commentId} viewerScope="viewer-a" />)

    fireEvent.click(screen.getByRole('button', {name: 'Like 4'}))
    fireEvent.click(screen.getByRole('button', {name: 'Bookmark 2'}))
    expect(screen.getByRole('button', {name: 'Unlike 5'})).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('button', {name: 'Remove bookmark 3'})).toBeEnabled())
    like.resolve(Response.json({code: 'SOCIAL_UNAVAILABLE'}, {status: 503}))
    expect(await screen.findByRole('status')).toHaveTextContent(labels.interactionError)
    expect(screen.getByRole('button', {name: 'Like 4'})).toBeEnabled()
    expect(screen.getByRole('button', {name: 'Remove bookmark 3'})).toBeEnabled()
    expect(fetch).toHaveBeenCalledWith(`/api/social/comments/${commentId}/like`, expect.objectContaining({method: 'PUT'}))
    expect(fetch).toHaveBeenCalledWith(`/api/social/comments/${commentId}/bookmark`, expect.objectContaining({method: 'PUT'}))
  })

  it('records only a completed browser share against the canonical comment URL', async () => {
    const browserShare = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'))
    vi.stubGlobal('navigator', {share: browserShare})
    vi.stubGlobal('crypto', {randomUUID: vi.fn().mockReturnValue('44444444-4444-4444-8444-444444444444')})
    const fetcher = vi.fn().mockResolvedValue(Response.json({created: true}))
    vi.stubGlobal('fetch', fetcher)
    render(<CommentActions {...counts} bookmarked={false} canMutate labels={labels} liked={false} locale="en" onReply={() => undefined} postId={postId} commentId={commentId} viewerScope="viewer-a" />)

    fireEvent.click(screen.getByRole('button', {name: 'Share 5'}))
    await waitFor(() => expect(browserShare).toHaveBeenCalledWith({url: `${window.location.origin}/en/posts/${postId}#comment-${commentId}`}))
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(`/api/social/comments/${commentId}/share`, expect.objectContaining({headers: {'idempotency-key': '44444444-4444-4444-8444-444444444444'}, method: 'POST'})))
    expect(screen.getByRole('button', {name: 'Share 6'})).toBeEnabled()

    fireEvent.click(screen.getByRole('button', {name: 'Share 6'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Share 6'})).toBeEnabled())
    expect(fetcher).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('isolates stale work when the comment identity changes', async () => {
    const pending = deferred<Response>()
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => { signal = init?.signal as AbortSignal; return pending.promise }))
    const view = render(<CommentActions {...counts} bookmarked={false} canMutate labels={labels} liked={false} locale="en" onReply={() => undefined} postId={postId} commentId={commentId} viewerScope="viewer-a" />)
    fireEvent.click(screen.getByRole('button', {name: 'Like 4'}))
    expect(screen.getByRole('button', {name: 'Unlike 5'})).toBeDisabled()

    view.rerender(<CommentActions {...counts} bookmarked canMutate labels={labels} liked locale="en" onReply={() => undefined} postId={postId} commentId="55555555-5555-4555-8555-555555555555" viewerScope="viewer-a" />)
    expect(signal?.aborted).toBe(true)
    expect(screen.getByRole('button', {name: 'Unlike 4'})).toBeEnabled()
    pending.resolve(Response.json({created: true}))
    await act(async () => {})
    expect(screen.getByRole('button', {name: 'Unlike 4'})).toHaveTextContent('4')
  })

  it('gates authenticated relationships but lets guests share', async () => {
    window.history.replaceState({}, '', `/en/posts/${postId}`)
    vi.stubGlobal('navigator', {clipboard: {writeText: vi.fn().mockResolvedValue(undefined)}})
    vi.stubGlobal('crypto', {randomUUID: vi.fn().mockReturnValue('44444444-4444-4444-8444-444444444444')})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({created: false})))
    render(<CommentActions {...counts} bookmarked={false} canMutate={false} labels={labels} liked={false} locale="en" onReply={() => undefined} postId={postId} commentId={commentId} />)

    fireEvent.click(screen.getByRole('button', {name: 'Like 4'}))
    expect(replace).toHaveBeenCalledWith(`/en/auth/sign-in?next=%2Fen%2Fposts%2F${postId}`)
    fireEvent.click(screen.getByRole('button', {name: 'Share 5'}))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/social/comments/${commentId}/share`, expect.any(Object)))
  })
})
