import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {flushSync} from 'react-dom'
import {createRoot} from 'react-dom/client'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {PostActions} from './PostActions.js'

const {prefetch, refresh, replace} = vi.hoisted(() => ({prefetch: vi.fn(), refresh: vi.fn(), replace: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({prefetch, refresh, replace})}))
vi.mock('next/link', () => ({default: ({children, prefetch: linkPrefetch, ...props}: {children: React.ReactNode; prefetch?: boolean | null; [key: string]: unknown}) => <a {...props} data-prefetch={linkPrefetch === false ? 'false' : 'shell'}>{children}</a>}))

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
    render(<PostActions bookmarked={false} canMutate={false} labels={labels} liked={false} locale="en" postId="22222222-2222-4222-8222-222222222222" returnTo="/en" />)

    const comments = screen.getByRole('link', {name: 'Comments'})
    const like = screen.getByRole('link', {name: 'Like'})
    const bookmark = screen.getByRole('link', {name: 'Bookmark'})
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
    render(<PostActions bookmarked labels={{bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}} liked locale="en" postId="22222222-2222-4222-8222-222222222222" />)

    const unlike = screen.getByRole('button', {name: 'Unlike'})
    const removeBookmark = screen.getByRole('button', {name: 'Remove bookmark'})
    expect(unlike).toHaveAttribute('aria-pressed', 'true')
    expect(removeBookmark).toHaveAttribute('aria-pressed', 'true')
    expect(unlike.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
    expect(removeBookmark.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
    expect(stylesheet).not.toMatch(/\.post-action\[aria-pressed="true"\][^{]*\{[^}]*background:/)
  })

  it('renders all four detail actions with locale-formatted counts in their accessible names', () => {
    const labels = {bookmark: 'Bookmark', comments: 'Comments', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', share: 'Share', unlike: 'Unlike'}
    render(<PostActions bookmarked={false} canMutate={false} commentCount={5678} labels={labels} liked={false} likeCount={12345} locale="en" postId="22222222-2222-4222-8222-222222222222" variant="detail" />)

    expect(screen.getByRole('link', {name: 'Like 12,345'})).toHaveTextContent('12,345')
    expect(screen.getByRole('link', {name: 'Comments 5,678'})).toHaveTextContent('5,678')
    expect(screen.getByRole('link', {name: 'Bookmark 0'})).toHaveTextContent('0')
    expect(screen.getByRole('button', {name: 'Share 0'})).toHaveTextContent('0')
  })

  it('falls back to zero for every detail action when a backward-compatible caller omits public counts', () => {
    const labels = {bookmark: 'Bookmark', comments: 'Comments', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', share: 'Share', unlike: 'Unlike'}
    render(<PostActions bookmarked={false} canMutate={false} labels={labels} liked={false} locale="en" postId="22222222-2222-4222-8222-222222222222" variant="detail" />)

    expect(screen.getByRole('link', {name: 'Like 0'})).toHaveTextContent('0')
    expect(screen.getByRole('link', {name: 'Comments 0'})).toHaveTextContent('0')
    expect(screen.getByRole('link', {name: 'Bookmark 0'})).toHaveTextContent('0')
    expect(screen.getByRole('button', {name: 'Share 0'})).toHaveTextContent('0')
  })

  it('keeps raw action counts and labels in the Feed variant', () => {
    const labels = {bookmark: 'Bookmark', comments: 'Comments', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', share: 'Share', unlike: 'Unlike'}
    render(<PostActions bookmarked={false} canMutate={false} commentCount={5678} labels={labels} liked={false} likeCount={12345} locale="en" postId="22222222-2222-4222-8222-222222222222" />)

    expect(screen.getByRole('link', {name: 'Like'})).toHaveTextContent('12345')
    expect(screen.getByRole('link', {name: 'Comments'})).toHaveTextContent('5678')
  })

  it('optimistically updates the affected like state and exact count without refreshing the route', async () => {
    let finish!: (value: Response) => void
    const request = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { finish = resolve }))
    vi.stubGlobal('fetch', request)
    render(<PostActions authorId="11111111-1111-4111-8111-111111111111" bookmarked={false} labels={{bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}} liked={false} likeCount={4} locale="en" postId="22222222-2222-4222-8222-222222222222" followsAuthor={false} />)

    fireEvent.click(screen.getByRole('button', {name: 'Like'}))

    expect(screen.getByRole('button', {name: 'Unlike'})).toBeDisabled()
    expect(screen.getByRole('button', {name: 'Unlike'})).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', {name: 'Unlike'})).toHaveTextContent('5')
    expect(request).toHaveBeenCalledWith('/api/social/posts/22222222-2222-4222-8222-222222222222/like', expect.objectContaining({credentials: 'include', method: 'PUT', signal: expect.any(AbortSignal)}))
    finish(new Response(JSON.stringify({created: true}), {status: 200}))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Unlike'})).toBeEnabled())
    expect(screen.getByRole('button', {name: 'Unlike'})).toHaveTextContent('5')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('rolls back only a rejected optimistic like to its exact previous count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({code: 'SOCIAL_UNAVAILABLE'}), {status: 503})))
    render(<PostActions bookmarked={false} labels={{bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}} liked={false} likeCount={4} locale="en" postId="22222222-2222-4222-8222-222222222222" />)

    fireEvent.click(screen.getByRole('button', {name: 'Like'}))
    expect(screen.getByRole('button', {name: 'Unlike'})).toHaveTextContent('5')

    expect(await screen.findByRole('status')).toHaveTextContent('Action failed.')
    expect(screen.getByRole('button', {name: 'Like'})).toHaveTextContent('4')
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
    flushSync(() => root.render(<PostActions bookmarked={false} labels={labels} liked={false} likeCount={4} locale="en" postId={firstPostId}/>))
    fireEvent.click(container.querySelector('button[aria-label="Like"]')!)
    expect(container.querySelector('button[aria-label="Unlike"]')).toHaveTextContent('5')

    flushSync(() => root.render(<PostActions bookmarked labels={labels} liked locale="en" likeCount={9} postId={nextPostId}/>))

    expect(container.querySelector('button[aria-label="Unlike"]')).toHaveTextContent('9')
    expect(container.querySelector('button[aria-label="Remove bookmark"]')).toBeEnabled()
    expect(container.querySelector('button[aria-label="Unlike"]')).toBeEnabled()

    flushSync(() => root.render(<PostActions bookmarked labels={labels} liked={false} likeCount={2} locale="en" postId={nextPostId}/>))
    expect(container.querySelector('button[aria-label="Like"]')).toHaveTextContent('2')
    expect(container.querySelector('button[aria-label="Remove bookmark"]')).toBeEnabled()
    flushSync(() => root.unmount())
  })

  it('does not revive a pending optimistic action after switching A to B and back to A', () => {
    const labels = {bookmark: 'Bookmark', follow: 'Follow', followingAction: 'Following', interactionError: 'Action failed.', like: 'Like', removeBookmark: 'Remove bookmark', unlike: 'Unlike'}
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(() => undefined)))
    const container = document.createElement('div')
    const root = createRoot(container)
    const firstPostId = '22222222-2222-4222-8222-222222222222'
    const nextPostId = '33333333-3333-4333-8333-333333333333'

    flushSync(() => root.render(<PostActions bookmarked={false} labels={labels} liked={false} likeCount={4} locale="en" postId={firstPostId}/>))
    fireEvent.click(container.querySelector('button[aria-label="Like"]')!)
    expect(container.querySelector('button[aria-label="Unlike"]')).toBeDisabled()

    flushSync(() => root.render(<PostActions bookmarked labels={labels} liked locale="en" likeCount={9} postId={nextPostId}/>))
    flushSync(() => root.render(<PostActions bookmarked={false} labels={labels} liked={false} likeCount={4} locale="en" postId={firstPostId}/>))

    expect(container.querySelector('button[aria-label="Like"]')).toHaveTextContent('4')
    expect(container.querySelector('button[aria-label="Like"]')).toBeEnabled()
    expect(container.querySelector('[role="status"]')).toBeNull()
    flushSync(() => root.unmount())
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
