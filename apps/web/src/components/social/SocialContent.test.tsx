import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import type {FeedPost, Notification, PostDetail} from '@aifans/contracts'
import {FeedContent} from './FeedContent.js'
import {NotificationsContent} from './NotificationsContent.js'
import {PostDetailContent} from './PostDetailContent.js'
import type {SocialLabels} from './types.js'

const labels: SocialLabels = {
  aiAccount: 'AI/IP', authRequiredTitle: 'Sign in required', authRequiredDescription: 'Sign in to see this page.',
  bookmark: 'Bookmark', bookmarksEmptyTitle: 'No bookmarks yet', bookmarksEmptyDescription: 'Save posts for later.',
  commentCount: '{count} comments', comments: 'Comments', deletedComment: 'This comment was deleted.',
  follow: 'Follow', followingAction: 'Following', homeEmptyTitle: 'Nothing here yet', homeEmptyDescription: 'New posts appear here.',
  humanAccount: 'Human', like: 'Like', notificationComment: 'commented on your post', notificationCommentLike: 'liked your comment',
  notificationFollow: 'followed you', notificationPostLike: 'liked your post', notificationReply: 'replied to your comment',
  notificationsEmptyTitle: 'No notifications yet', notificationsEmptyDescription: 'Updates appear here.',
  postNotFoundTitle: 'Post not found', postNotFoundDescription: 'It may have been removed.',
  removeBookmark: 'Remove bookmark', unlike: 'Unlike', unavailableTitle: 'Unable to load', unavailableDescription: 'Try again later.',
  interactionError: 'Action failed. Try again.',
}
const ip = {kind: 'ip' as const, id: '11111111-1111-4111-8111-111111111111', username: 'luma', displayName: 'Luma', languages: ['en' as const]}
const post: FeedPost = {id: '22222222-2222-4222-8222-222222222222', body: 'A real post', languageCode: 'en', publishedAt: '2026-08-31T12:00:00.000Z', author: ip, likeCount: 4, commentCount: 2, viewerHasLiked: true, viewerHasBookmarked: false, viewerFollowsAuthor: false}

describe('real social content', () => {
  it('renders API post fields and preserves the locale in the detail URL', () => {
    render(<FeedContent labels={labels} locale="zh-CN" result={{status: 'ok', data: {items: [post], nextCursor: null}}} />)
    expect(screen.getByRole('article')).toHaveTextContent('Luma')
    expect(screen.getByRole('article')).toHaveTextContent('A real post')
    expect(screen.getByRole('article')).toHaveTextContent('4')
    expect(screen.getByRole('link', {name: /A real post/})).toHaveAttribute('href', `/zh-CN/posts/${post.id}`)
    expect(screen.getByText('AI/IP')).toBeVisible()
  })

  it('renders localized empty, authentication, and unavailable states without posts', () => {
    const {rerender} = render(<FeedContent labels={labels} locale="en" result={{status: 'ok', data: {items: [], nextCursor: null}}} />)
    expect(screen.getByRole('heading', {name: 'Nothing here yet'})).toBeVisible()
    rerender(<FeedContent labels={labels} locale="en" result={{status: 'auth-required'}} />)
    expect(screen.getByRole('heading', {name: 'Sign in required'})).toBeVisible()
    rerender(<FeedContent labels={labels} locale="en" result={{status: 'unavailable'}} />)
    expect(screen.getByRole('heading', {name: 'Unable to load'})).toBeVisible()
    expect(screen.queryByRole('article')).toBeNull()
  })

  it('distinguishes human and IP comments and uses a placeholder for deleted bodies', () => {
    const detail: PostDetail = {...post, comments: {items: [
      {id: '33333333-3333-4333-8333-333333333333', postId: post.id, parentCommentId: null, state: 'published', body: 'Human reply', createdAt: '2026-08-31T12:05:00.000Z', author: {kind: 'human', id: '44444444-4444-4444-8444-444444444444', username: 'alex', displayName: 'Alex'}},
      {id: '55555555-5555-4555-8555-555555555555', postId: post.id, parentCommentId: null, state: 'deleted', createdAt: '2026-08-31T12:06:00.000Z', author: ip},
    ], nextCursor: null}}
    render(<PostDetailContent labels={labels} locale="en" result={{status: 'ok', data: detail}} />)
    expect(screen.getByText('Human')).toBeVisible()
    expect(screen.getAllByText('AI/IP').length).toBeGreaterThan(0)
    expect(screen.getByText('Human reply')).toBeVisible()
    expect(screen.getByText('This comment was deleted.')).toBeVisible()
  })

  it('renders real notification rows and safe empty/auth states', () => {
    const notification: Notification = {id: '66666666-6666-4666-8666-666666666666', kind: 'post_like', actor: {kind: 'human', id: '44444444-4444-4444-8444-444444444444', username: 'alex', displayName: 'Alex'}, postId: post.id, commentId: null, createdAt: '2026-08-31T12:07:00.000Z', readAt: null}
    const {rerender} = render(<NotificationsContent labels={labels} locale="zh-CN" result={{status: 'ok', data: {items: [notification], nextCursor: null}}} />)
    expect(screen.getByRole('link')).toHaveTextContent('Alex liked your post')
    expect(screen.getByRole('link')).toHaveAttribute('href', `/zh-CN/posts/${post.id}`)
    rerender(<NotificationsContent labels={labels} locale="zh-CN" result={{status: 'auth-required'}} />)
    expect(screen.getByRole('heading', {name: 'Sign in required'})).toBeVisible()
  })
})
