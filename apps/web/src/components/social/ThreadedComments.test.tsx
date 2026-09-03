import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import type {PostDetail, PublicComment} from '@aifans/contracts'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {PostDetailContent} from './PostDetailContent.js'

const {replace} = vi.hoisted(() => ({replace: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({prefetch: vi.fn(), refresh: vi.fn(), replace})}))
vi.mock('next/link', () => ({default: ({children, prefetch: _prefetch, ...props}: {children: React.ReactNode; prefetch?: boolean; [key: string]: unknown}) => <a {...props}>{children}</a>}))

const postId = '22222222-2222-4222-8222-222222222222'
const rootId = '33333333-3333-4333-8333-333333333333'
const replyId = '55555555-5555-4555-8555-555555555555'
const labels = {
  aiAccount: 'AI', authRequiredTitle: 'Sign in', authRequiredDescription: 'Please sign in', bookmark: 'Bookmark', bookmarksEmptyTitle: 'No bookmarks', bookmarksEmptyDescription: 'None', commentCount: '{count} comments', comments: 'Comments', commentsEmptyTitle: 'No comments', commentSortChronological: 'Chronological', createdBy: 'Created by', deletedComment: 'Deleted', follow: 'Follow', followingAction: 'Following', homeEmptyTitle: 'Empty', homeEmptyDescription: 'Empty', humanAccount: 'Human', interactionError: 'Action failed.', like: 'Like', loadMore: 'Load more', aifansActor: 'AI', notificationComment: '', notificationCommentLike: '', notificationFollow: '', notificationPostLike: '', notificationReply: '', notificationsEmptyTitle: '', notificationsEmptyDescription: '', postNotFoundTitle: '', postNotFoundDescription: '', removeBookmark: 'Remove bookmark', unlike: 'Unlike', unavailableTitle: '', unavailableDescription: '', unavailableRetry: '', unavailableRetrying: '', commentPlaceholder: 'Write a comment', commentSubmit: 'Comment', commentSending: 'Sending', commentSuccess: 'Posted', reply: 'Reply', replyingTo: 'Replying to @{name}', cancelReply: 'Cancel reply', signInToComment: 'Sign in to comment', markRead: '', markingRead: '', profileNotFoundTitle: '', profileNotFoundDescription: '', followers: '', posts: '', postMedia: '', signInToInteract: '', startChat: '', startingChat: '', chatStartError: '', share: 'Share',
}

function comment(overrides: Partial<PublicComment> & Pick<PublicComment, 'id' | 'rootCommentId' | 'parentCommentId' | 'body'>): PublicComment {
  return {author: {kind: 'human', id: '44444444-4444-4444-8444-444444444444', username: 'alex', displayName: 'Alex'}, bookmarkCount: 2, createdAt: '2026-09-03T08:00:00.000Z', likeCount: 4, postId, replyCount: 0, shareCount: 5, state: 'published', viewerHasBookmarked: false, viewerHasLiked: false, ...overrides}
}

const root = comment({id: rootId, rootCommentId: rootId, parentCommentId: null, body: 'Root A', replyCount: 1})
const reply = comment({id: replyId, rootCommentId: rootId, parentCommentId: rootId, body: 'Reply A1', author: {kind: 'human', id: '66666666-6666-4666-8666-666666666666', username: 'sam', displayName: 'Sam'}})
const otherRootId = '77777777-7777-4777-8777-777777777777'
const otherRoot = comment({id: otherRootId, rootCommentId: otherRootId, parentCommentId: null, body: 'Root B'})
const detail: PostDetail = {id: postId, body: 'Post', languageCode: 'en', publishedAt: '2026-09-03T07:00:00.000Z', likeCount: 1, commentCount: 3, bookmarkCount: 1, shareCount: 1, author: {kind: 'ip', id: '11111111-1111-4111-8111-111111111111', username: 'luma', displayName: 'Luma', languages: ['en'], visualType: 'anime'}, comments: {groups: [{root, replies: [reply]}, {root: otherRoot, replies: []}], nextCursor: null}}

afterEach(() => { vi.unstubAllGlobals(); replace.mockReset() })

describe('threaded comments', () => {
  it('renders flat always-expanded root groups with dividers only between groups and four actions per item', () => {
    const {container} = render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: 'ok', data: detail}} viewerScope="viewer-a" />)
    const groups = container.querySelectorAll('.comment-thread-group')
    expect(groups).toHaveLength(2)
    expect(groups[0]!.querySelectorAll('.comment-thread-item')).toHaveLength(2)
    expect(groups[0]!.querySelectorAll('details')).toHaveLength(0)
    expect(groups[0]!.querySelectorAll('.comment-thread-item--reply')).toHaveLength(1)
    expect(groups[0]!.querySelectorAll('.post-actions__controls')).toHaveLength(2)
    expect(within(groups[0] as HTMLElement).getAllByRole('button', {name: /Reply/})).toHaveLength(2)
    expect(container.querySelectorAll('.comment-thread-group + .comment-thread-group')).toHaveLength(1)
  })

  it('keeps public descendants visible when their root is an authorless tombstone', () => {
    const tombstone = {...root, author: null, body: undefined, state: 'deleted' as const}
    const tombstonedDetail: PostDetail = {...detail, comments: {groups: [{root: tombstone, replies: [reply]}], nextCursor: null}}
    const {container} = render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: 'ok', data: tombstonedDetail}} viewerScope="viewer-a" />)

    expect(screen.getAllByText('Deleted')).not.toHaveLength(0)
    expect(screen.getByText('Reply A1')).toBeVisible()
    expect(container.querySelectorAll('.comment-thread-item')).toHaveLength(2)
    expect(container.querySelectorAll('.comment-thread-group--connected')).toHaveLength(1)
    const tombstoneItem = document.getElementById(`comment-${rootId}`)!
    expect(tombstoneItem.querySelector('.comment-avatar')).toBeNull()
    expect(tombstoneItem.querySelector('.comment-actions')).toBeNull()
    expect(document.getElementById(`comment-${replyId}`)?.querySelector('.comment-actions')).not.toBeNull()
  })

  it('targets the exact comment in the one primary composer and cancel restores post mode', () => {
    const created = comment({id: '88888888-8888-4888-8888-888888888888', rootCommentId: rootId, parentCommentId: replyId, body: 'Exact reply'})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(created, {status: 201})))
    render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: 'ok', data: detail}} viewerScope="viewer-a" />)
    const replyRow = document.getElementById(`comment-${replyId}`)!
    fireEvent.click(within(replyRow).getByRole('button', {name: 'Reply 0'}))
    expect(screen.getByText('Replying to @Sam')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Cancel reply'})).toBeVisible()
    fireEvent.change(screen.getByRole('textbox', {name: 'Write a comment'}), {target: {value: 'Exact reply'}})
    fireEvent.click(screen.getByRole('button', {name: 'Comment'}))
    expect(fetch).toHaveBeenCalledWith(`/api/social/posts/${postId}/comments`, expect.objectContaining({body: JSON.stringify({body: 'Exact reply', parentCommentId: replyId})}))

    fireEvent.click(screen.getByRole('button', {name: 'Cancel reply'}))
    expect(screen.queryByText('Replying to @Sam')).toBeNull()
  })

  it('inserts a returned deep reply into its root group and restores post targeting after success', async () => {
    const created = comment({id: '88888888-8888-4888-8888-888888888888', rootCommentId: rootId, parentCommentId: replyId, body: 'Deep reply', author: {kind: 'human', id: '99999999-9999-4999-8999-999999999999', username: 'rui', displayName: 'Rui'}})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(created, {status: 201})))
    const {container} = render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: 'ok', data: detail}} viewerScope="viewer-a" />)
    fireEvent.click(within(document.getElementById(`comment-${replyId}`)!).getByRole('button', {name: 'Reply 0'}))
    fireEvent.change(screen.getByRole('textbox', {name: 'Write a comment'}), {target: {value: created.body}})
    fireEvent.click(screen.getByRole('button', {name: 'Comment'}))

    expect(await screen.findByText('Deep reply')).toBeVisible()
    expect(container.querySelectorAll('.comment-thread-group')[0]!.querySelectorAll('.comment-thread-item')).toHaveLength(3)
    expect(screen.queryByText('Replying to @Sam')).toBeNull()
  })

  it('loads and focuses a shared comment anchor when its root group is not on the first page', async () => {
    const firstPage: PostDetail = {...detail, comments: {groups: [{root, replies: [reply]}], nextCursor: 'next'}}
    window.history.replaceState({}, '', `/en/posts/${postId}#comment-${otherRootId}`)
    const scrollIntoView = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({group: {root: otherRoot, replies: []}})))
    Element.prototype.scrollIntoView = scrollIntoView

    render(<PostDetailContent labels={labels} locale="en" result={{status: 'ok', data: firstPage}} />)

    expect(await screen.findByText('Root B')).toBeVisible()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({behavior: 'smooth', block: 'center'}))
    expect(document.activeElement).toBe(document.getElementById(`comment-${otherRootId}`))
    expect(fetch).toHaveBeenCalledWith(`/api/social/posts/${postId}/comments/${otherRootId}/context`, expect.objectContaining({credentials: 'include'}))
    expect(document.querySelectorAll(`#comment-${otherRootId}`)).toHaveLength(1)
  })

  it('aborts a stale context lookup when the hash changes and keeps the current page usable on 404', async () => {
    const nextTarget = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    let resolveLookup!: (response: Response) => void
    const lookup = new Promise<Response>((resolve) => { resolveLookup = resolve })
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal)
      return signals.length === 1 ? lookup : Promise.resolve(Response.json({code: 'COMMENT_NOT_FOUND'}, {status: 404}))
    }))
    window.history.replaceState({}, '', `/en/posts/${postId}#comment-${otherRootId}`)
    render(<PostDetailContent labels={labels} locale="en" result={{status: 'ok', data: {...detail, comments: {groups: [{root, replies: [reply]}], nextCursor: 'next'}}}} />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    window.history.replaceState({}, '', `/en/posts/${postId}#comment-${nextTarget}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => expect(signals[0]?.aborted).toBe(true))
    resolveLookup(Response.json({group: {root: otherRoot, replies: []}}))
    await act(async () => {})

    expect(screen.getByText('Root A')).toBeVisible()
    expect(screen.queryByText('Root B')).toBeNull()
  })
})
