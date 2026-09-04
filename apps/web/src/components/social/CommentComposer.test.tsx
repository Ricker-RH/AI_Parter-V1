import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {CommentComposer} from './CommentComposer.js'
import {readFileSync} from 'node:fs'

const {refresh, replace} = vi.hoisted(() => ({refresh: vi.fn(), replace: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({refresh, replace})}))
vi.mock('next/link', () => ({default: ({children, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>}))

const labels = {commentPlaceholder: 'Write a comment', commentSubmit: 'Comment', commentSending: 'Posting', commentSuccess: 'Posted', interactionError: 'Action failed', signInToComment: 'Sign in to comment'}
const postId = '22222222-2222-4222-8222-222222222222'
const created = {id: '33333333-3333-4333-8333-333333333333', postId, rootCommentId: '33333333-3333-4333-8333-333333333333', parentCommentId: null, state: 'published' as const, body: 'Hello world', createdAt: '2026-09-02T12:00:00.000Z', likeCount: 0, replyCount: 0, bookmarkCount: 0, shareCount: 0, viewerHasLiked: false, viewerHasBookmarked: false, author: {kind: 'human' as const, id: '44444444-4444-4444-8444-444444444444', username: 'alex', displayName: 'Alex'}}

afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); replace.mockReset() })

describe('CommentComposer', () => {
  it('renders the primary viewer avatar and an accessible icon submit target with resilient fallbacks', () => {
    const {container, rerender} = render(<CommentComposer authenticated labels={labels} locale="en" postId={postId} viewer={{displayName: 'Rui', avatarUrl: 'https://media.example/rui.webp'}} viewerScope="viewer-a"/>)

    const image = screen.getByRole('img', {name: 'Rui'})
    expect(image).toHaveAttribute('src', 'https://media.example/rui.webp')
    expect(screen.getByRole('button', {name: 'Comment'})).toContainElement(container.querySelector('.comment-submit-visual svg'))
    expect(screen.getByRole('button', {name: 'Comment'})).toBeDisabled()

    fireEvent.error(image)
    expect(container.querySelector('.comment-composer-avatar img')).toBeNull()
    expect(screen.getByRole('img', {name: 'Rui'})).toHaveTextContent('R')

    rerender(<CommentComposer authenticated labels={labels} locale="en" postId={postId} viewerScope="viewer-a"/>)
    expect(container.querySelector('.comment-composer-avatar')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.comment-composer-avatar svg')).not.toBeNull()
  })

  it('uses the same composer instance and keeps its draft when the exact reply target changes', () => {
    const view = render(<CommentComposer authenticated labels={labels} locale="en" postId={postId} viewer={{displayName: 'Rui'}} viewerScope="viewer-a"/>)
    fireEvent.change(screen.getByRole('textbox', {name: 'Write a comment'}), {target: {value: 'Draft'}})
    const form = view.container.querySelector('.comment-composer')

    view.rerender(<CommentComposer authenticated labels={labels} locale="en" parentCommentId="33333333-3333-4333-8333-333333333333" postId={postId} viewer={{displayName: 'Rui'}} viewerScope="viewer-a"/>)
    expect(view.container.querySelector('.comment-composer')).toBe(form)
    expect(screen.getByRole('textbox', {name: 'Write a comment'})).toHaveValue('Draft')
    expect(view.container.querySelector('.comment-composer-avatar')).not.toBeNull()
  })

  it('keeps identity cancellation out of render', () => {
    const source = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/social/CommentComposer.tsx' : 'apps/web/src/components/social/CommentComposer.tsx', 'utf8')
    expect(source).toContain('<ScopedCommentComposer key={scope}')
    expect(source).toContain("import {Avatar}")
    expect(source).not.toContain('function ViewerAvatar')
    expect(source).not.toContain('controller.current?.abort(); controller.current=null; setBody')
  })

  it('resets its draft when the authenticated viewer scope changes', () => {
    const view = render(<CommentComposer authenticated labels={labels} locale="en" postId={postId} viewer={{displayName: 'Rui'}} viewerScope="viewer-a"/>)
    fireEvent.change(screen.getByRole('textbox', {name: 'Write a comment'}), {target: {value: 'Private draft'}})

    view.rerender(<CommentComposer authenticated labels={labels} locale="en" postId={postId} viewer={{displayName: 'Sam'}} viewerScope="viewer-b"/>)

    expect(screen.getByRole('textbox', {name: 'Write a comment'})).toHaveValue('')
    expect(screen.getByRole('img', {name: 'Sam'})).toHaveTextContent('S')
  })

  it('accepts a real strict created comment, inserts it locally, clears and focuses the input without refreshing', async () => {
    const onCommentCreated = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(created), {status: 201})))
    render(<CommentComposer authenticated labels={labels} locale="en" onCommentCreated={onCommentCreated} postId={postId} viewerScope="viewer-a"/>)
    const input = screen.getByRole('textbox', {name: 'Write a comment'})

    fireEvent.change(input, {target: {value: ' Hello world '}})
    fireEvent.click(screen.getByRole('button', {name: 'Comment'}))

    await waitFor(() => expect(onCommentCreated).toHaveBeenCalledWith(created))
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
    expect(screen.getByText('Posted')).toBeVisible()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('keeps the draft and rolls back only the failed comment submission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({code: 'RATE_LIMITED'}), {status: 429})))
    render(<CommentComposer authenticated labels={labels} locale="en" postId={postId} viewerScope="viewer-a"/>)
    const input = screen.getByRole('textbox', {name: 'Write a comment'})

    fireEvent.change(input, {target: {value: 'Keep this draft'}})
    fireEvent.click(screen.getByRole('button', {name: 'Comment'}))

    expect(await screen.findByText('Action failed')).toBeVisible()
    expect(input).toHaveValue('Keep this draft')
    fireEvent.change(input, {target: {value: 'Keep this revised draft'}})
    expect(screen.queryByText('Action failed')).toBeNull()
    expect(refresh).not.toHaveBeenCalled()
  })
})
