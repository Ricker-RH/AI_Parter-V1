import {fireEvent, render, screen} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import type {AnchorHTMLAttributes, ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'
import type {FeedPost} from '@aifans/contracts'
import {PublicProfileContent} from './PublicProfileContent.js'
import type {SocialLabels} from './types.js'
import styles from './PublicProfileContent.module.css'

const moduleUrl = import.meta.url
const stylesheet = readFileSync(fileURLToPath(new URL('./PublicProfileContent.module.css', moduleUrl)), 'utf8')

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
  it('renders a contextual public-profile title and metadata in Threads-style semantic order', () => {
    const {container} = render(<PublicProfileContent labels={labels} locale="en" result={{status: 'ok', data: {profile, followerCount: 12, posts: {items: [], nextCursor: null}}}} />)
    const header = container.querySelector(`.${styles.header}`)
    const identity = container.querySelector(`.${styles.identity}`)
    const avatar = container.querySelector(`.${styles.avatar}`)
    const actions = container.querySelector(`.${styles.profileActions}`)

    expect(screen.getByRole('heading', {level: 1, name: 'luma'})).toBeInTheDocument()
    expect(screen.getByRole('heading', {level: 2, name: 'Luma'})).toBeVisible()
    expect(screen.getAllByRole('heading', {level: 1})).toHaveLength(1)
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
    expect(identity?.compareDocumentPosition(avatar!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(actions?.parentElement).toBe(header)
    expect(screen.getByText('12 followers').compareDocumentPosition(actions!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
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

  it('keeps long profile text and authenticated action feedback in an action row below metadata', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done })))
    const longProfile = {...profile, displayName: 'Luma the exceptionally long profile name that must wrap without overlapping actions'}
    const {container} = render(<PublicProfileContent labels={labels} locale="en" result={{status: 'ok', data: {profile: longProfile, followerCount: 12, viewerFollows: false, posts: {items: [], nextCursor: null}}}} />)
    const header = container.querySelector(`.${styles.header}`)
    const actions = container.querySelector(`.${styles.profileActions}`)

    expect(screen.getByRole('heading', {level: 2, name: longProfile.displayName})).toBeVisible()
    expect(actions?.parentElement).toBe(header)
    expect(screen.getByRole('button', {name: 'Follow'})).toBeVisible()
    fireEvent.click(screen.getByRole('button', {name: 'Chat'}))
    expect(screen.getByRole('button', {name: 'Opening…'})).toBeDisabled()

    resolve(Response.json({invalid: true}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to start a conversation.')
    expect(stylesheet).toMatch(/\.profileActions\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\)[\s\S]*?\.profileSurface\s*\{[\s\S]*?border:[\s\S]*?border-radius/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\)[\s\S]*?\.contextualTitle\s*\{[\s\S]*?clip:\s*rect\(0 0 0 0\)[\s\S]*?position:\s*absolute/)
    expect(stylesheet).toMatch(/overflow-wrap:\s*anywhere/)
    expect(stylesheet).toMatch(/min-height:\s*44px/)
    expect(stylesheet).not.toMatch(/@media \(max-width: 359px\)[\s\S]*?\.profileActions\s*\{[\s\S]*?grid-template-columns/)
    expect(stylesheet).toMatch(/\.interaction-error:not\(:empty\)/)
    expect(stylesheet).not.toMatch(/\.interaction-error\)\s*\{\s*min-height/)
  })
})
