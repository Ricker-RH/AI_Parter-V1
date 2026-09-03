import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {flushSync} from 'react-dom'
import {createRoot} from 'react-dom/client'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {PostActions} from './PostActions.js'

const {prefetch, refresh, replace} = vi.hoisted(() => ({prefetch: vi.fn(), refresh: vi.fn(), replace: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({prefetch, refresh, replace})}))
vi.mock('next/link', () => ({default: ({children, prefetch: linkPrefetch, ...props}: {children: React.ReactNode; prefetch?: boolean | null; [key: string]: unknown}) => <a {...props} data-prefetch={linkPrefetch === false ? 'false' : 'shell'}>{children}</a>}))

const postId = '22222222-2222-4222-8222-222222222222'
const authoritativeCounts = {likeCount: 4, commentCount: 2, bookmarkCount: 2, shareCount: 4}
const labels = {bookmark: 'Bookmark', comments: 'Comments', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', share: 'Share', unlike: 'Unlike'}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return {promise, reject, resolve}
}

afterEach(() => { vi.unstubAllGlobals(); prefetch.mockReset(); refresh.mockReset(); replace.mockReset() })

describe('PostActions', () => {
  it('isolates authenticated action state in a keyed committed subtree', () => {
    const source = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/social/PostActions.tsx' : 'apps/web/src/components/social/PostActions.tsx', 'utf8')
    expect(source).toContain('<ScopedAuthenticatedActions key={scope}')
    expect(source).not.toContain('if (stored.scope !== scope) setStored')
    expect(source).not.toContain('identity.current = scope')
  })

  it('defers comment and guest auth navigation prefetches until intent, then de-duplicates their URLs', () => {
    const labels = {bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike', comments: 'Comments'}
    render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate={false} labels={labels} liked={false} locale="en" postId="22222222-2222-4222-8222-222222222222" returnTo="/en" />)

    const comments = screen.getByRole('link', {name: 'Comments 2'})
    const like = screen.getByRole('link', {name: 'Like 4'})
    const bookmark = screen.getByRole('link', {name: 'Bookmark 2'})
    expect(prefetch).not.toHaveBeenCalled()
    expect(comments).toHaveAttribute('data-prefetch', 'false')
    expect(like).toHaveAttribute('data-prefetch', 'false')
    expect(bookmark).toHaveAttribute('data-prefetch', 'false')

    fireEvent.pointerEnter(comments)
    fireEvent.focus(comments)
    fireEvent.touchStart(comments)
    expect(prefetch).toHaveBeenCalledTimes(1)
    expect(prefetch).toHaveBeenLastCalledWith('/en/posts/22222222-2222-4222-8222-222222222222', expect.any(Object))

    fireEvent.focus(like)
    fireEvent.touchStart(bookmark)
    expect(prefetch).toHaveBeenCalledTimes(2)
    expect(prefetch).toHaveBeenLastCalledWith('/en/auth/sign-in?next=%2Fen', expect.any(Object))
  })

  it('uses only a currentColor solid icon for active like and bookmark feedback', () => {
    const stylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css', 'utf8')
    render(<PostActions {...authoritativeCounts} bookmarked labels={{bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}} liked locale="en" postId="22222222-2222-4222-8222-222222222222" />)

    const unlike = screen.getByRole('button', {name: 'Unlike 4'})
    const removeBookmark = screen.getByRole('button', {name: 'Remove bookmark 2'})
    expect(unlike).toHaveAttribute('aria-pressed', 'true')
    expect(removeBookmark).toHaveAttribute('aria-pressed', 'true')
    expect(unlike.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
    expect(removeBookmark.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
    expect(stylesheet).not.toMatch(/\.post-action\[aria-pressed="true"\][^{]*\{[^}]*background:/)
  })

  it('uses foreground-only hover feedback without a gray action plate', () => {
    const stylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css', 'utf8')
    const baseRule = stylesheet.match(/\.post-action\s*\{([^}]*)\}/)?.[1] ?? ''
    const hoverRule = stylesheet.match(/\.post-action:hover\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(baseRule).toContain('background: transparent')
    expect(hoverRule).toContain('background: transparent')
    expect(hoverRule).toContain('color: var(--shell-muted)')
    expect(hoverRule).not.toContain('var(--shell-hover)')
    expect(stylesheet).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--shell-focus\)/)
  })

  it('formats all authoritative counts in the Detail variant', () => {
    const labels = {bookmark: 'Bookmark', comments: 'Comments', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', share: 'Share', unlike: 'Unlike'}
    render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate={false} commentCount={5678} labels={labels} liked={false} likeCount={12345} locale="en" postId="22222222-2222-4222-8222-222222222222" variant="detail" />)

    expect(screen.getByRole('link', {name: 'Like 12,345'})).toHaveTextContent('12,345')
    expect(screen.getByRole('link', {name: 'Comments 5,678'})).toHaveTextContent('5,678')
    expect(screen.getByRole('link', {name: 'Bookmark 2'})).toHaveTextContent('2')
    expect(screen.getByRole('button', {name: 'Share 4'})).toHaveTextContent('4')
  })

  it('marks the comment action active only on the Detail surface', () => {
    const labels = {bookmark: 'Bookmark', comments: 'Comments', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', share: 'Share', unlike: 'Unlike'}
    const {rerender} = render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate={false} commentCount={2} labels={labels} liked={false} locale="en" postId="22222222-2222-4222-8222-222222222222" variant="detail" />)

    const detailComment = screen.getByRole('link', {name: 'Comments 2'})
    expect(detailComment).toHaveAttribute('aria-current', 'page')
    expect(detailComment.querySelector('svg')).toHaveAttribute('fill', 'currentColor')

    rerender(<PostActions {...authoritativeCounts} bookmarked={false} canMutate={false} commentCount={2} labels={labels} liked={false} locale="en" postId="22222222-2222-4222-8222-222222222222" variant="feed" />)
    const feedComment = screen.getByRole('link', {name: 'Comments 2'})
    expect(feedComment).not.toHaveAttribute('aria-current')
    expect(feedComment.querySelector('svg')).toHaveAttribute('fill', 'none')
  })

  it('renders all four authoritative zero counts with accessible Detail labels', () => {
    render(<PostActions {...authoritativeCounts} bookmarked={false} bookmarkCount={0} canMutate={false} commentCount={0} labels={labels} liked={false} likeCount={0} locale="en" postId={postId} shareCount={0} variant="detail" />)

    expect(screen.getByRole('link', {name: 'Like 0'})).toHaveTextContent('0')
    expect(screen.getByRole('link', {name: 'Comments 0'})).toHaveTextContent('0')
    expect(screen.getByRole('link', {name: 'Bookmark 0'})).toHaveTextContent('0')
    expect(screen.getByRole('button', {name: 'Share 0'})).toHaveTextContent('0')
  })

  it('compacts visible Feed counts while keeping exact counts in action names and titles', () => {
    const labels = {bookmark: 'Bookmark', comments: 'Comments', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', share: 'Share', unlike: 'Unlike'}
    render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate={false} commentCount={5678} labels={labels} liked={false} likeCount={12345} locale="en" postId="22222222-2222-4222-8222-222222222222" />)

    expect(screen.getByRole('link', {name: 'Like 12,345'})).toHaveTextContent('12K')
    expect(screen.getByRole('link', {name: 'Comments 5,678'})).toHaveTextContent('5.7K')
    expect(screen.getByRole('link', {name: 'Bookmark 2'})).toHaveTextContent('2')
    expect(screen.getByRole('button', {name: 'Share 4'})).toHaveTextContent('4')
  })

  it('uses Chinese compact units without losing exact localized semantics', () => {
    const counts = {likeCount: 12345, commentCount: 56789, bookmarkCount: 123456, shareCount: 987654}
    render(<PostActions {...counts} bookmarked={false} canMutate={false} labels={labels} liked={false} locale="zh-CN" postId={postId} />)

    const expected = [
      ['link', 'Like 12,345', '1.2万'],
      ['link', 'Comments 56,789', '5.7万'],
      ['link', 'Bookmark 123,456', '12万'],
      ['button', 'Share 987,654', '99万'],
    ] as const
    for (const [role, name, visibleCount] of expected) {
      const action = screen.getByRole(role, {name})
      expect(action).toHaveAttribute('title', name)
      expect(action).toHaveTextContent(visibleCount)
    }
  })

  it('keeps four controls in a fixed row and independent long errors in a full-width feedback row', async () => {
    const longLabels = {...labels, interactionError: 'This deliberately long localized action error must wrap below every control without moving them.'}
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({code: 'SOCIAL_UNAVAILABLE'}, {status: 503})))
    const {container} = render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate labels={longLabels} liked={false} locale="en" postId={postId} viewerScope="viewer-a" />)

    fireEvent.click(screen.getByRole('button', {name: 'Like 4'}))
    await screen.findByRole('status')
    fireEvent.click(screen.getByRole('button', {name: 'Bookmark 2'}))
    await waitFor(() => expect(screen.getAllByRole('status')).toHaveLength(2))

    const controls = container.querySelector('.post-actions__controls')!
    const feedback = container.querySelector('.post-actions__feedback')!
    expect(controls.querySelectorAll('.post-action')).toHaveLength(4)
    expect(controls.querySelector('[role="status"]')).toBeNull()
    expect(feedback).toHaveTextContent(longLabels.interactionError)
    expect(feedback.querySelectorAll('[role="status"]')).toHaveLength(2)
    const stylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css', 'utf8')
    expect(stylesheet).toMatch(/\.post-actions__controls\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/)
    expect(stylesheet).toMatch(/\.post-actions__controls \.post-action\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%/)
    expect(stylesheet).toMatch(/\.post-actions__feedback\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%/)
  })

  it('optimistically bookmarks with an independent pending state and keeps the acknowledged count', async () => {
    const request = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(request.promise))
    render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate labels={labels} liked={false} locale="en" postId={postId} viewerScope="viewer-a" />)

    fireEvent.click(screen.getByRole('button', {name: 'Bookmark 2'}))
    expect(screen.getByRole('button', {name: 'Remove bookmark 3'})).toHaveTextContent('3')
    expect(screen.getByRole('button', {name: 'Remove bookmark 3'})).toBeDisabled()
    expect(screen.getByRole('button', {name: 'Like 4'})).toBeEnabled()
    expect(screen.getByRole('button', {name: 'Share 4'})).toBeEnabled()
    request.resolve(Response.json({created: true}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Remove bookmark 3'})).toBeEnabled())
    expect(screen.getByRole('button', {name: 'Remove bookmark 3'})).toHaveTextContent('3')
  })

  it('optimistically removes a bookmark and keeps the acknowledged lower count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({deleted: true})))
    render(<PostActions {...authoritativeCounts} bookmarked canMutate labels={labels} liked={false} locale="en" postId={postId} viewerScope="viewer-a" />)

    fireEvent.click(screen.getByRole('button', {name: 'Remove bookmark 2'}))

    expect(screen.getByRole('button', {name: 'Bookmark 1'})).toHaveTextContent('1')
    await waitFor(() => expect(screen.getByRole('button', {name: 'Bookmark 1'})).toBeEnabled())
    expect(fetch).toHaveBeenCalledWith(`/api/social/posts/${postId}/bookmark`, expect.objectContaining({method: 'DELETE'}))
    expect(screen.getByRole('button', {name: 'Bookmark 1'})).toHaveTextContent('1')
  })

  it.each([
    ['like', false, 4, 'Like', 'Unlike', {created: false}],
    ['like', true, 4, 'Unlike', 'Like', {deleted: false}],
    ['bookmark', false, 2, 'Bookmark', 'Remove bookmark', {created: false}],
    ['bookmark', true, 2, 'Remove bookmark', 'Bookmark', {deleted: false}],
  ] as const)('does not change the %s count when the target relationship already exists or is absent', async (action, active, count, initialLabel, targetLabel, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(response)))
    render(<PostActions {...authoritativeCounts} bookmarked={action === 'bookmark' ? active : false} bookmarkCount={action === 'bookmark' ? count : 2} canMutate labels={labels} liked={action === 'like' ? active : false} likeCount={action === 'like' ? count : 4} locale="en" postId={postId} viewerScope="viewer-a" />)

    fireEvent.click(screen.getByRole('button', {name: `${initialLabel} ${count}`}))
    await waitFor(() => expect(screen.getByRole('button', {name: `${targetLabel} ${count}`})).toBeEnabled())

    expect(screen.getByRole('button', {name: `${targetLabel} ${count}`})).toHaveTextContent(String(count))
  })

  it('rolls a failed bookmark back exactly and redirects an expired bookmark session', async () => {
    window.history.replaceState({}, '', `/en/posts/${postId}?commentCursor=next`)
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({code: 'SOCIAL_UNAVAILABLE'}, {status: 503}))
      .mockResolvedValueOnce(new Response(null, {status: 401}))
    vi.stubGlobal('fetch', fetcher)
    const first = render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate labels={labels} liked={false} locale="en" postId={postId} viewerScope="viewer-a" />)
    fireEvent.click(screen.getByRole('button', {name: 'Bookmark 2'}))
    expect(await screen.findByRole('status')).toHaveTextContent(labels.interactionError)
    expect(screen.getByRole('button', {name: 'Bookmark 2'})).toHaveTextContent('2')
    first.unmount()

    render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate labels={labels} liked={false} locale="en" postId={postId} viewerScope="viewer-a" />)
    fireEvent.click(screen.getByRole('button', {name: 'Bookmark 2'}))
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/en/auth/sign-in?next=%2Fen%2Fposts%2F${postId}%3FcommentCursor%3Dnext`))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('records a native share only after browser completion and treats cancellation as neutral', async () => {
    const browserShare = deferred<void>()
    const nativeShare = vi.fn().mockReturnValueOnce(browserShare.promise).mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'))
    vi.stubGlobal('navigator', {share: nativeShare})
    vi.stubGlobal('crypto', {randomUUID: vi.fn().mockReturnValue('33333333-3333-4333-8333-333333333333')})
    const fetcher = vi.fn().mockResolvedValue(Response.json({created: true}))
    vi.stubGlobal('fetch', fetcher)
    render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate labels={labels} liked={false} locale="en" postId={postId} variant="detail" viewerScope="viewer-a" />)

    fireEvent.click(screen.getByRole('button', {name: 'Share 4'}))
    expect(nativeShare).toHaveBeenCalledWith({url: `${window.location.origin}/en/posts/${postId}`})
    expect(fetcher).not.toHaveBeenCalled()
    browserShare.resolve()
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(`/api/social/posts/${postId}/share`, expect.objectContaining({
      credentials: 'include',
      headers: {'idempotency-key': '33333333-3333-4333-8333-333333333333'},
      method: 'POST',
      signal: expect.any(AbortSignal),
    })))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Share 5'})).toBeEnabled())

    fireEvent.click(screen.getByRole('button', {name: 'Share 5'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Share 5'})).toBeEnabled())
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('uses clipboard fallback for a guest and records the anonymous completed share', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {clipboard: {writeText}})
    vi.stubGlobal('crypto', {randomUUID: vi.fn().mockReturnValue('33333333-3333-4333-8333-333333333333')})
    const fetcher = vi.fn().mockResolvedValue(Response.json({created: false}))
    vi.stubGlobal('fetch', fetcher)
    render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate={false} labels={labels} liked={false} locale="en" postId={postId} variant="detail" />)

    fireEvent.click(screen.getByRole('button', {name: 'Share 4'}))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/en/posts/${postId}`))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Share 5'})).toBeEnabled())
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('retries recording once with the same key, shares once, and gives a later completion a fresh key', async () => {
    vi.useFakeTimers()
    try {
      const nativeShare = vi.fn().mockResolvedValue(undefined)
      const randomUUID = vi.fn()
        .mockReturnValueOnce('33333333-3333-4333-8333-333333333333')
        .mockReturnValueOnce('44444444-4444-4444-8444-444444444444')
      vi.stubGlobal('navigator', {share: nativeShare})
      vi.stubGlobal('crypto', {randomUUID})
      const fetcher = vi.fn()
        .mockRejectedValueOnce(new TypeError('network lost after commit'))
        .mockResolvedValueOnce(Response.json({created: false}))
        .mockResolvedValueOnce(Response.json({created: true}))
      vi.stubGlobal('fetch', fetcher)
      render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate labels={labels} liked={false} locale="en" postId={postId} variant="detail" viewerScope="viewer-a" />)

      fireEvent.click(screen.getByRole('button', {name: 'Share 4'}))
      await act(async () => {})
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', {name: 'Share 4'})).toBeDisabled()
      expect(screen.getByRole('button', {name: 'Like 4'})).toBeEnabled()
      expect(screen.getByRole('button', {name: 'Bookmark 2'})).toBeEnabled()
      await act(async () => { await vi.advanceTimersByTimeAsync(250) })
      expect(screen.getByRole('button', {name: 'Share 5'})).toBeEnabled()
      expect(nativeShare).toHaveBeenCalledTimes(1)
      expect(fetcher).toHaveBeenCalledTimes(2)
      const firstKey = new Headers((fetcher.mock.calls[0]?.[1] as RequestInit).headers).get('idempotency-key')
      const retryKey = new Headers((fetcher.mock.calls[1]?.[1] as RequestInit).headers).get('idempotency-key')
      expect(firstKey).toBe('33333333-3333-4333-8333-333333333333')
      expect(retryKey).toBe(firstKey)

      fireEvent.click(screen.getByRole('button', {name: 'Share 5'}))
      await act(async () => {})
      expect(screen.getByRole('button', {name: 'Share 6'})).toBeEnabled()
      expect(nativeShare).toHaveBeenCalledTimes(2)
      expect(new Headers((fetcher.mock.calls[2]?.[1] as RequestInit).headers).get('idempotency-key')).toBe('44444444-4444-4444-8444-444444444444')
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    [Response.json({created: true}, {status: 503})],
    [Response.json({created: 'yes'})],
    [Response.json({created: true, extra: 'leak'})],
  ])('does not claim a share count for an unacknowledged record', async (recordResponse) => {
    vi.stubGlobal('navigator', {share: vi.fn().mockResolvedValue(undefined)})
    vi.stubGlobal('crypto', {randomUUID: vi.fn().mockReturnValue('33333333-3333-4333-8333-333333333333')})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(recordResponse))
    render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate labels={labels} liked={false} locale="en" postId={postId} variant="detail" viewerScope="viewer-a" />)

    fireEvent.click(screen.getByRole('button', {name: 'Share 4'}))

    expect(await screen.findByRole('status')).toHaveTextContent(labels.interactionError)
    expect(screen.getByRole('button', {name: 'Share 4'})).toBeEnabled()
    expect(screen.getByRole('button', {name: 'Like 4'})).toBeEnabled()
  })

  it('aborts and isolates a pending share when locale changes for the same viewer and post', async () => {
    const record = deferred<Response>()
    let signal: AbortSignal | undefined
    vi.stubGlobal('navigator', {share: vi.fn().mockResolvedValue(undefined)})
    vi.stubGlobal('crypto', {randomUUID: vi.fn().mockReturnValue('33333333-3333-4333-8333-333333333333')})
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal as AbortSignal
      return record.promise
    }))
    const view = render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate labels={labels} liked={false} locale="en" postId={postId} variant="detail" viewerScope="viewer-a" />)
    fireEvent.click(screen.getByRole('button', {name: 'Share 4'}))
    await waitFor(() => expect(signal).toBeDefined())

    view.rerender(<PostActions {...authoritativeCounts} bookmarked={false} canMutate labels={labels} liked={false} locale="zh-CN" postId={postId} variant="detail" viewerScope="viewer-a" />)
    expect(signal?.aborted).toBe(true)
    expect(screen.getByRole('button', {name: 'Share 4'})).toBeEnabled()
    expect(screen.queryByRole('status')).toBeNull()
    record.resolve(Response.json({created: true}))
    await act(async () => {})
    expect(screen.getByRole('button', {name: 'Share 4'})).toBeEnabled()
  })

  it('removes a settled share controller so unmount does not abort it again', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('navigator', {share: vi.fn().mockResolvedValue(undefined)})
    vi.stubGlobal('crypto', {randomUUID: vi.fn().mockReturnValue('33333333-3333-4333-8333-333333333333')})
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal as AbortSignal
      return Promise.resolve(Response.json({created: true}))
    }))
    const view = render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate labels={labels} liked={false} locale="en" postId={postId} variant="detail" viewerScope="viewer-a" />)
    fireEvent.click(screen.getByRole('button', {name: 'Share 4'}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Share 5'})).toBeEnabled())

    view.unmount()

    expect(signal?.aborted).toBe(false)
  })

  it('optimistically updates the affected like state and exact count without refreshing the route', async () => {
    let finish!: (value: Response) => void
    const request = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { finish = resolve }))
    vi.stubGlobal('fetch', request)
    render(<PostActions {...authoritativeCounts} authorId="11111111-1111-4111-8111-111111111111" bookmarked={false} labels={{bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}} liked={false} likeCount={4} locale="en" postId="22222222-2222-4222-8222-222222222222" followsAuthor={false} />)

    fireEvent.click(screen.getByRole('button', {name: 'Like 4'}))

    expect(screen.getByRole('button', {name: 'Unlike 5'})).toBeDisabled()
    expect(screen.getByRole('button', {name: 'Unlike 5'})).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', {name: 'Unlike 5'})).toHaveTextContent('5')
    expect(request).toHaveBeenCalledWith('/api/social/posts/22222222-2222-4222-8222-222222222222/like', expect.objectContaining({credentials: 'include', method: 'PUT', signal: expect.any(AbortSignal)}))
    finish(new Response(JSON.stringify({created: true}), {status: 200}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Unlike 5'})).toBeEnabled())
    expect(screen.getByRole('button', {name: 'Unlike 5'})).toHaveTextContent('5')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('rolls back only a rejected optimistic like to its exact previous count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({code: 'SOCIAL_UNAVAILABLE'}), {status: 503})))
    render(<PostActions {...authoritativeCounts} bookmarked={false} labels={{bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}} liked={false} likeCount={4} locale="en" postId="22222222-2222-4222-8222-222222222222" />)

    fireEvent.click(screen.getByRole('button', {name: 'Like 4'}))
    expect(screen.getByRole('button', {name: 'Unlike 5'})).toHaveTextContent('5')

    expect(await screen.findByRole('status')).toHaveTextContent('Action failed.')
    expect(screen.getByRole('button', {name: 'Like 4'})).toHaveTextContent('4')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('renders a new post or viewer scope from authoritative props before passive cleanup can run', () => {
    const labels = {bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}
    const request = vi.fn().mockReturnValue(new Promise<Response>(() => undefined))
    vi.stubGlobal('fetch', request)
    const container = document.createElement('div')
    const root = createRoot(container)
    const firstPostId = '22222222-2222-4222-8222-222222222222'
    const nextPostId = '33333333-3333-4333-8333-333333333333'
    flushSync(() => root.render(<PostActions {...authoritativeCounts} bookmarked={false} labels={labels} liked={false} likeCount={4} locale="en" postId={firstPostId}/>))
    fireEvent.click(container.querySelector('button[aria-label="Like 4"]')!)
    expect(container.querySelector('button[aria-label="Unlike 5"]')).toHaveTextContent('5')

    flushSync(() => root.render(<PostActions {...authoritativeCounts} bookmarked labels={labels} liked locale="en" likeCount={9} postId={nextPostId}/>))

    expect(container.querySelector('button[aria-label="Unlike 9"]')).toHaveTextContent('9')
    expect(container.querySelector('button[aria-label="Remove bookmark 2"]')).toBeEnabled()
    expect(container.querySelector('button[aria-label="Unlike 9"]')).toBeEnabled()

    flushSync(() => root.render(<PostActions {...authoritativeCounts} bookmarked labels={labels} liked={false} likeCount={2} locale="en" postId={nextPostId}/>))
    expect(container.querySelector('button[aria-label="Like 2"]')).toHaveTextContent('2')
    expect(container.querySelector('button[aria-label="Remove bookmark 2"]')).toBeEnabled()
    flushSync(() => root.unmount())
  })

  it('does not revive a pending optimistic action after switching A to B and back to A', () => {
    const labels = {bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(() => undefined)))
    const container = document.createElement('div')
    const root = createRoot(container)
    const firstPostId = '22222222-2222-4222-8222-222222222222'
    const nextPostId = '33333333-3333-4333-8333-333333333333'

    flushSync(() => root.render(<PostActions {...authoritativeCounts} bookmarked={false} labels={labels} liked={false} likeCount={4} locale="en" postId={firstPostId}/>))
    fireEvent.click(container.querySelector('button[aria-label="Like 4"]')!)
    expect(container.querySelector('button[aria-label="Unlike 5"]')).toBeDisabled()

    flushSync(() => root.render(<PostActions {...authoritativeCounts} bookmarked labels={labels} liked locale="en" likeCount={9} postId={nextPostId}/>))
    flushSync(() => root.render(<PostActions {...authoritativeCounts} bookmarked={false} labels={labels} liked={false} likeCount={4} locale="en" postId={firstPostId}/>))

    expect(container.querySelector('button[aria-label="Like 4"]')).toHaveTextContent('4')
    expect(container.querySelector('button[aria-label="Like 4"]')).toBeEnabled()
    expect(container.querySelector('[role="status"]')).toBeNull()
    flushSync(() => root.unmount())
  })

  it('aborts and isolates pending bookmark and share work across post identity changes', async () => {
    const bookmarkRecord = deferred<Response>()
    const shareRecord = deferred<Response>()
    const signals: AbortSignal[] = []
    vi.stubGlobal('navigator', {share: vi.fn().mockResolvedValue(undefined)})
    vi.stubGlobal('crypto', {randomUUID: vi.fn().mockReturnValue('44444444-4444-4444-8444-444444444444')})
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal)
      return url.endsWith('/bookmark') ? bookmarkRecord.promise : shareRecord.promise
    }))
    const container = document.createElement('div')
    const root = createRoot(container)
    const firstPostId = postId
    const nextPostId = '33333333-3333-4333-8333-333333333333'
    flushSync(() => root.render(<PostActions {...authoritativeCounts} bookmarked={false} bookmarkCount={2} labels={labels} liked={false} locale="en" postId={firstPostId} shareCount={4}/>))
    fireEvent.click(container.querySelector('button[aria-label="Bookmark 2"]')!)
    fireEvent.click(container.querySelector('button[aria-label="Share 4"]')!)
    await waitFor(() => expect(signals).toHaveLength(2))

    flushSync(() => root.render(<PostActions {...authoritativeCounts} bookmarked bookmarkCount={8} labels={labels} liked locale="en" postId={nextPostId} shareCount={9}/>))
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(container.querySelector('button[aria-label="Remove bookmark 8"]')).toHaveTextContent('8')
    expect(container.querySelector('button[aria-label="Share 9"]')).toHaveTextContent('9')
    expect(container.querySelectorAll('button:disabled')).toHaveLength(0)
    expect(container.querySelector('[role="status"]')).toBeNull()

    bookmarkRecord.resolve(Response.json({created: true}))
    shareRecord.resolve(Response.json({created: true}))
    await act(async () => {})
    flushSync(() => root.render(<PostActions {...authoritativeCounts} bookmarked={false} bookmarkCount={2} labels={labels} liked={false} locale="en" postId={firstPostId} shareCount={4}/>))
    expect(container.querySelector('button[aria-label="Bookmark 2"]')).toHaveTextContent('2')
    expect(container.querySelector('button[aria-label="Share 4"]')).toHaveTextContent('4')
    expect(container.querySelectorAll('button:disabled')).toHaveLength(0)
    expect(container.querySelector('[role="status"]')).toBeNull()
    flushSync(() => root.unmount())
  })

  it('aborts pending work and restores authoritative state when the viewer scope changes', async () => {
    const request = deferred<Response>()
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal as AbortSignal
      return request.promise
    }))
    const view = render(<PostActions {...authoritativeCounts} bookmarked={false} canMutate labels={labels} liked={false} locale="en" postId={postId} viewerScope="viewer-a" />)
    fireEvent.click(screen.getByRole('button', {name: 'Bookmark 2'}))
    expect(screen.getByRole('button', {name: 'Remove bookmark 3'})).toHaveTextContent('3')

    view.rerender(<PostActions {...authoritativeCounts} bookmarked canMutate labels={labels} liked locale="en" postId={postId} viewerScope="viewer-b" />)

    expect(signal?.aborted).toBe(true)
    expect(screen.getByRole('button', {name: 'Remove bookmark 2'})).toHaveTextContent('2')
    expect(screen.getByRole('button', {name: 'Unlike 4'})).toHaveTextContent('4')
    expect(screen.queryByRole('status')).toBeNull()
    request.resolve(Response.json({created: true}))
    await act(async () => {})
    expect(screen.getByRole('button', {name: 'Remove bookmark 2'})).toHaveTextContent('2')
  })

  it('announces mutation errors accessibly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({code: 'SOCIAL_UNAVAILABLE'}), {status: 503})))
    render(<PostActions {...authoritativeCounts} authorId="11111111-1111-4111-8111-111111111111" bookmarked={false} labels={{bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}} liked={false} locale="en" postId="22222222-2222-4222-8222-222222222222" followsAuthor={false} />)
    fireEvent.click(screen.getByRole('button', {name: 'Bookmark 2'}))
    expect(await screen.findByRole('status')).toHaveTextContent('Action failed.')
  })

  it('sends an expired session to localized full-page sign in without retrying the mutation', async () => {
    window.history.replaceState({}, '', '/en/posts/22222222-2222-4222-8222-222222222222?commentCursor=next')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 401})))
    render(<PostActions {...authoritativeCounts} authorId="11111111-1111-4111-8111-111111111111" bookmarked={false} labels={{bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}} liked={false} locale="en" postId="22222222-2222-4222-8222-222222222222" followsAuthor={false} />)

    fireEvent.click(screen.getByRole('button', {name: 'Like 4'}))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/en/auth/sign-in?next=%2Fen%2Fposts%2F22222222-2222-4222-8222-222222222222%3FcommentCursor%3Dnext'))
  })
})
