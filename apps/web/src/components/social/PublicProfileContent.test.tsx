import {fireEvent, render, screen} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import type {AnchorHTMLAttributes, ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'
import type {FeedPost} from '@aifans/contracts'
import {PublicProfileContent} from './PublicProfileContent.js'
import type {SocialLabels} from './types.js'
import styles from './PublicProfileContent.module.css'

vi.mock('next/link', () => ({
  default: ({children, ...props}: AnchorHTMLAttributes<HTMLAnchorElement> & {children: ReactNode}) => <a {...props}>{children}</a>,
}))
vi.mock('next/navigation', () => ({useRouter: () => ({refresh: vi.fn(), replace: vi.fn()})}))
vi.mock('../../lib/analytics/provider.js', () => ({useAnalytics: () => ({capture: vi.fn()})}))

const labels: SocialLabels = {
  aiAccount: 'AI/IP', authRequiredTitle: 'Sign in required', authRequiredDescription: 'Sign in to see this page.',
  bookmark: 'Bookmark', bookmarksEmptyTitle: 'No bookmarks yet', bookmarksEmptyDescription: 'Save posts for later.',
  commentCount: '{count} comments', comments: 'Comments', deletedComment: 'Deleted comment', follow: 'Follow', followingAction: 'Following',
  homeEmptyTitle: 'Nothing here yet', homeEmptyDescription: 'New posts appear here.', humanAccount: 'Human', interactionError: 'Action failed.',
  loadMore: 'Load more', aifansActor: 'AIFANS', like: 'Like', notificationComment: 'commented', notificationCommentLike: 'liked', notificationFollow: 'followed', notificationPostLike: 'liked', notificationReply: 'replied',
  notificationsEmptyTitle: 'No notifications', notificationsEmptyDescription: 'Updates appear here.', postNotFoundTitle: 'Post not found', postNotFoundDescription: 'Removed.',
  removeBookmark: 'Remove bookmark', unlike: 'Unlike', unavailableTitle: 'Unable to load', unavailableDescription: 'Try again later.', unavailableRetry: 'Retry', unavailableRetrying: 'Retrying…',
  createdBy: 'Created by', commentPlaceholder: 'Write a comment', commentSubmit: 'Comment', commentSending: 'Posting', commentSuccess: 'Posted', reply: 'Reply', signInToComment: 'Sign in to comment', markRead: 'Mark read', markingRead: 'Marking',
  profileNotFoundTitle: 'Profile not found', profileNotFoundDescription: 'Not public', followers: 'followers', posts: 'Posts', signInToInteract: 'Sign in to interact',
  startChat: 'Chat', startingChat: 'Opening…', chatStartError: 'Unable to start a conversation.',
}
const profile = {kind: 'ip' as const, id: '11111111-1111-4111-8111-111111111111', username: 'luma', displayName: 'Luma', bio: 'A quiet astronomer sharing notes from the night sky.', languages: ['en' as const], visualType: 'anime' as const, creator: {id: '77777777-7777-4777-8777-777777777777', username: 'luma_creator', displayName: 'Luma Creator'}}

describe('PublicProfileContent', () => {
  it('renders a compact public profile header and posts empty state without visual metadata', () => {
    render(<PublicProfileContent labels={labels} locale="en" result={{status: 'ok', data: {profile, followerCount: 12, posts: {items: [], nextCursor: null}}}} />)

    expect(screen.getByRole('heading', {name: 'Luma'})).toBeVisible()
    expect(screen.getByText('@luma')).toBeVisible()
    expect(screen.getByText('Created by @luma_creator')).toBeVisible()
    expect(screen.getByText(profile.bio)).toBeVisible()
    expect(screen.getByText('12 followers')).toBeVisible()
    expect(screen.getByRole('link', {name: 'Follow'})).toHaveAttribute('href', `/en/auth/sign-in?next=${encodeURIComponent(`/en/profiles/${profile.id}`)}`)
    expect(screen.getByRole('link', {name: 'Chat'})).toHaveAttribute('href', `/en/auth/sign-in?next=${encodeURIComponent(`/en/profiles/${profile.id}`)}`)
    expect(screen.getByRole('heading', {name: 'Posts'})).toBeVisible()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', {name: 'Nothing here yet'})).toBeVisible()
    expect(screen.queryByText('anime')).not.toBeInTheDocument()
  })

  it('uses PostCard for posts and preserves the unavailable result state', () => {
    const post: FeedPost = {id: '22222222-2222-4222-8222-222222222222', body: 'A real post', languageCode: 'en', publishedAt: '2026-08-31T12:00:00.000Z', author: profile, likeCount: 0, commentCount: 0}
    const {rerender} = render(<PublicProfileContent labels={labels} locale="en" result={{status: 'ok', data: {profile, followerCount: 0, posts: {items: [post], nextCursor: null}}}} />)
    expect(screen.getByText('A real post').closest('article')).toHaveClass('post-card')

    rerender(<PublicProfileContent labels={labels} locale="en" result={{status: 'unavailable'}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load')
    expect(screen.queryByRole('link', {name: 'Chat'})).toBeNull()
    expect(screen.queryByRole('button', {name: 'Chat'})).toBeNull()

    rerender(<PublicProfileContent labels={labels} locale="en" result={{status: 'not-found'}} />)
    expect(screen.queryByRole('link', {name: 'Chat'})).toBeNull()
    expect(screen.queryByRole('button', {name: 'Chat'})).toBeNull()
  })

  it('keeps long profile text and chat pending or errors in a dedicated mobile action row', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done })))
    const longProfile = {...profile, displayName: 'Luma the exceptionally long profile name that must wrap without overlapping actions'}
    const {container} = render(<PublicProfileContent labels={labels} locale="en" result={{status: 'ok', data: {profile: longProfile, followerCount: 12, viewerFollows: false, posts: {items: [], nextCursor: null}}}} />)
    const header = container.querySelector(`.${styles.header}`)
    const actions = container.querySelector(`.${styles.profileActions}`)

    expect(screen.getByRole('heading', {name: longProfile.displayName})).toBeVisible()
    expect(actions?.parentElement).toBe(header)
    fireEvent.click(screen.getByRole('button', {name: 'Chat'}))
    expect(screen.getByRole('button', {name: 'Opening…'})).toBeDisabled()

    resolve(Response.json({invalid: true}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to start a conversation.')
    expect(readFileSync('src/components/social/PublicProfileContent.module.css', 'utf8')).toMatch(/@media \(max-width: 560px\)[\s\S]*?\.profileActions\s*\{[\s\S]*?flex:\s*0 0 100%[\s\S]*?flex-wrap:\s*wrap[\s\S]*?position:\s*static/s)
  })
})
