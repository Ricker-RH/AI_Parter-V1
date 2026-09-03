import {fireEvent, render, screen, within} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import type {AnchorHTMLAttributes, ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'
import type {FeedPage} from '@aifans/contracts'
import {PublicProfileContent} from './PublicProfileContent.js'
import {PublicProfileTabs} from './PublicProfileTabs.js'
import type {SocialLabels} from './types.js'
import styles from './PublicProfileContent.module.css'

const moduleUrl = import.meta.url
const stylesheet = readFileSync(fileURLToPath(new URL('./PublicProfileContent.module.css', moduleUrl)), 'utf8')
type FeedPagePost = FeedPage['items'][number]

vi.mock('next/link', () => ({
  default: ({children, ...props}: AnchorHTMLAttributes<HTMLAnchorElement> & {children: ReactNode}) => <a {...props}>{children}</a>,
}))
vi.mock('next/navigation', () => ({useRouter: () => ({refresh: vi.fn(), replace: vi.fn()})}))
vi.mock('../../lib/analytics/provider.js', () => ({useAnalytics: () => ({capture: vi.fn()})}))
vi.mock('../GlobalMoreMenu.js', () => ({GlobalMoreMenu: ({labels}: {labels: {more: string}}) => <button type="button">{labels.more}</button>}))

const labels: SocialLabels = {
  aiAccount: 'AI/IP', authRequiredTitle: 'Sign in required', authRequiredDescription: 'Sign in to see this page.',
  bookmark: 'Bookmark', bookmarksEmptyTitle: 'No bookmarks yet', bookmarksEmptyDescription: 'Save posts for later.',
  commentCount: '{count} comments', comments: 'Comments', deletedComment: 'Deleted comment', follow: 'Follow', followingAction: 'Following',
  homeEmptyTitle: 'Nothing here yet', homeEmptyDescription: 'New posts appear here.', humanAccount: 'Human', interactionError: 'Action failed.',
  loadMore: 'Load more', aifansActor: 'AIFANS', like: 'Like', notificationComment: 'commented', notificationCommentLike: 'liked', notificationFollow: 'followed', notificationPostLike: 'liked', notificationReply: 'replied',
  notificationsEmptyTitle: 'No notifications', notificationsEmptyDescription: 'Updates appear here.', postNotFoundTitle: 'Post not found', postNotFoundDescription: 'Removed.',
  removeBookmark: 'Remove bookmark', unlike: 'Unlike', unavailableTitle: 'Unable to load', unavailableDescription: 'Try again later.', unavailableRetry: 'Retry', unavailableRetrying: 'Retrying…',
  createdBy: 'Created by', commentPlaceholder: 'Write a comment', commentSubmit: 'Comment', commentSending: 'Posting', commentSuccess: 'Posted', reply: 'Reply', signInToComment: 'Sign in to comment', markRead: 'Mark read', markingRead: 'Marking',
  profileNotFoundTitle: 'Profile not found', profileNotFoundDescription: 'Not public', followers: 'followers', posts: 'Posts', postMedia: 'Post media', signInToInteract: 'Sign in to interact',
  startChat: 'Chat', startingChat: 'Opening…', chatStartError: 'Unable to start a conversation.',
  back: 'Back', search: 'Search', more: 'More', profileMedia: 'Media', profileMediaEmptyTitle: 'No media yet', profileMediaEmptyDescription: 'Images shared in posts appear here.',
}
const profile = {kind: 'ip' as const, id: '11111111-1111-4111-8111-111111111111', username: 'luma', displayName: 'Luma', bio: 'A quiet astronomer sharing notes from the night sky.', languages: ['en' as const], visualType: 'anime' as const, creator: {id: '77777777-7777-4777-8777-777777777777', username: 'luma_creator', displayName: 'Luma Creator'}}
const feedProfile = profile

describe('PublicProfileContent', () => {
  it('replaces pagination state and aborts stale loads when the profile or viewer changes', async () => {
    const first: FeedPagePost = {id: '22222222-2222-4222-8222-222222222222', body: 'Profile A post', languageCode: 'en', publishedAt: '2026-09-02T12:00:00.000Z', author: feedProfile, likeCount: 0, commentCount: 0, bookmarkCount: 0, shareCount: 0}
    const next: FeedPagePost = {id: '33333333-3333-4333-8333-333333333333', body: 'Profile B post', languageCode: 'en', publishedAt: '2026-09-02T12:00:00.000Z', author: feedProfile, likeCount: 0, commentCount: 0, bookmarkCount: 0, shareCount: 0}
    let resolve!: (response: Response) => void
    const request = vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done }))
    vi.stubGlobal('fetch', request)
    const {rerender} = render(<PublicProfileTabs canMutate={false} labels={labels} locale="en" posts={{items: [first], nextCursor: 'cursor-a'}} profileId={profile.id} referenceTime={0} returnTo="/en" viewerScope="viewer-a"/>)

    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))
    const signal = (request.mock.calls[0]?.[1] as RequestInit).signal!
    const nextProfileId = '88888888-8888-4888-8888-888888888888'
    rerender(<PublicProfileTabs canMutate={false} labels={labels} locale="en" posts={{items: [next], nextCursor: 'cursor-b'}} profileId={nextProfileId} referenceTime={0} returnTo="/en" viewerScope="viewer-b"/>)

    expect(screen.getByText('Profile B post')).toBeVisible()
    expect(screen.queryByText('Profile A post')).toBeNull()
    expect(signal.aborted).toBe(true)
    resolve(Response.json({profile, followerCount: 0, posts: {items: [first], nextCursor: null}}))
    await Promise.resolve()
    expect(screen.getByText('Profile B post')).toBeVisible()
    expect(screen.queryByText('Profile A post')).toBeNull()
  })

  it('replaces the initial cursor page when the server refreshes the same profile', () => {
    const first: FeedPagePost = {id: '22222222-2222-4222-8222-222222222222', body: 'Older server page', languageCode: 'en', publishedAt: '2026-09-02T12:00:00.000Z', author: feedProfile, likeCount: 0, commentCount: 0, bookmarkCount: 0, shareCount: 0}
    const refreshed: FeedPagePost = {id: '33333333-3333-4333-8333-333333333333', body: 'Refreshed server page', languageCode: 'en', publishedAt: '2026-09-02T12:00:00.000Z', author: feedProfile, likeCount: 0, commentCount: 0, bookmarkCount: 0, shareCount: 0}
    const {rerender} = render(<PublicProfileTabs canMutate={false} labels={labels} locale="en" posts={{items: [first], nextCursor: 'old-cursor'}} profileId={profile.id} referenceTime={0} returnTo="/en" viewerScope="viewer-a"/>)

    rerender(<PublicProfileTabs canMutate={false} labels={labels} locale="en" posts={{items: [refreshed], nextCursor: 'new-cursor'}} profileId={profile.id} referenceTime={0} returnTo="/en" viewerScope="viewer-a"/>)

    expect(screen.getByText('Refreshed server page')).toBeVisible()
    expect(screen.queryByText('Older server page')).toBeNull()
  })

  it('renders a contextual public-profile title and metadata in Threads-style semantic order', () => {
    const {container} = render(<PublicProfileContent labels={labels} locale="en" result={{status: 'ok', data: {profile, followerCount: 12, posts: {items: [], nextCursor: null}}}} />)
    const header = container.querySelector(`.${styles.header}`)
    const identity = container.querySelector(`.${styles.identity}`)
    const avatar = container.querySelector(`.${styles.avatar}`)
    const actions = container.querySelector(`.${styles.profileActions}`)
    const contextualHeader = screen.getByRole('heading', {level: 1, name: '@luma'}).closest('header')
    const frame = container.querySelector('[data-profile-content-frame]')

    expect(screen.getByRole('heading', {level: 1, name: '@luma'})).toBeInTheDocument()
    expect(screen.getByRole('link', {name: 'Back'})).toHaveAttribute('href', '/en')
    expect(screen.getByRole('link', {name: 'Search'})).toHaveAttribute('href', '/en/search')
    expect(screen.getByRole('button', {name: 'More'})).toBeVisible()
    expect(screen.getByRole('heading', {level: 2, name: 'Luma'})).toBeVisible()
    expect(screen.getAllByRole('heading', {level: 1})).toHaveLength(1)
    expect(screen.getAllByText('@luma')).toHaveLength(2)
    expect(screen.getByText('Created by @luma_creator')).toBeVisible()
    expect(screen.getByText(profile.bio)).toBeVisible()
    expect(screen.getByText('12 followers')).toBeVisible()
    expect(screen.getByRole('link', {name: 'Follow'})).toHaveAttribute('href', `/en/auth/sign-in?next=${encodeURIComponent(`/en/profiles/${profile.id}`)}`)
    expect(screen.getByRole('link', {name: 'Chat'})).toHaveAttribute('href', `/en/auth/sign-in?next=${encodeURIComponent(`/en/profiles/${profile.id}`)}`)
    expect(screen.getByRole('tab', {name: 'Posts'})).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', {name: 'Media'})).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('heading', {name: 'Nothing here yet'})).toBeVisible()
    expect(screen.queryByText('anime')).not.toBeInTheDocument()
    expect(identity?.compareDocumentPosition(avatar!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(actions?.parentElement).toBe(header)
    expect(screen.getByText('12 followers').compareDocumentPosition(actions!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(frame).toBe(container.firstElementChild?.children[1])
    expect(container.firstElementChild?.children[0]).toBe(contextualHeader)
    expect(frame).not.toContainElement(contextualHeader)
  })

  it('groups real post images by calendar day and opens an accessible image viewer', () => {
    const mediaPosts: FeedPagePost[] = [
      {id: '22222222-2222-4222-8222-222222222222', body: 'First post', languageCode: 'en', publishedAt: '2026-09-02T12:00:00.000Z', author: feedProfile, likeCount: 0, commentCount: 0, bookmarkCount: 0, shareCount: 0, media: [
        {id: '33333333-3333-4333-8333-333333333333', type: 'image', url: 'https://media.example/one.webp', altText: 'Moon one', width: 800, height: 800, aspectRatio: 1},
        {id: '44444444-4444-4444-8444-444444444444', type: 'image', url: 'https://media.example/two.webp', altText: 'Moon two', width: 1200, height: 800, aspectRatio: 1.5},
      ]},
      {id: '55555555-5555-4555-8555-555555555555', body: 'Earlier post', languageCode: 'en', publishedAt: '2026-09-01T01:00:00.000Z', author: feedProfile, likeCount: 0, commentCount: 0, bookmarkCount: 0, shareCount: 0, media: [
        {id: '66666666-6666-4666-8666-666666666666', type: 'image', url: 'https://media.example/three.webp', altText: 'Moon three', width: 600, height: 900, aspectRatio: 2 / 3},
      ]},
    ]
    render(<PublicProfileContent labels={labels} locale="en" result={{status: 'ok', data: {profile, followerCount: 0, posts: {items: mediaPosts, nextCursor: null}}}} />)

    fireEvent.click(screen.getByRole('tab', {name: 'Media'}))
    expect(screen.getByRole('tab', {name: 'Media'})).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', {name: 'September 2, 2026'})).toBeVisible()
    expect(screen.getByRole('heading', {name: 'September 1, 2026'})).toBeVisible()
    expect(screen.getByText('First post')).not.toBeVisible()
    const first = screen.getByRole('button', {name: 'Moon one'})
    first.focus()
    fireEvent.click(first)
    const dialog = screen.getByRole('dialog', {name: 'Media'})
    expect(within(dialog).getByRole('img', {name: 'Moon one'})).toHaveAttribute('src', 'https://media.example/one.webp')
    fireEvent.click(within(dialog).getByRole('button', {name: 'Next'}))
    expect(within(dialog).getByRole('img', {name: 'Moon two'})).toBeVisible()
    const close = within(dialog).getByRole('button', {name: 'Close'})
    close.focus()
    fireEvent.keyDown(document, {key: 'Tab', shiftKey: true})
    expect(within(dialog).getByRole('button', {name: 'Next'})).toHaveFocus()
    fireEvent.keyDown(document, {key: 'Tab'})
    expect(close).toHaveFocus()
    fireEvent.keyDown(document, {key: 'Escape'})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(first).toHaveFocus()
  })

  it('keeps both tab panels mounted and implements roving keyboard navigation', () => {
    render(<PublicProfileContent labels={labels} locale="en" result={{status: 'ok', data: {profile, followerCount: 0, posts: {items: [], nextCursor: null}}}} />)
    const postsTab = screen.getByRole('tab', {name: 'Posts'})
    const mediaTab = screen.getByRole('tab', {name: 'Media'})
    expect(postsTab).toHaveAttribute('tabindex', '0')
    expect(mediaTab).toHaveAttribute('tabindex', '-1')
    expect(document.getElementById('profile-media-panel')).toHaveAttribute('hidden')
    postsTab.focus()
    fireEvent.keyDown(postsTab, {key: 'ArrowRight'})
    expect(mediaTab).toHaveFocus()
    expect(mediaTab).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('profile-posts-panel')).toHaveAttribute('hidden')
    fireEvent.keyDown(mediaTab, {key: 'Home'})
    expect(postsTab).toHaveFocus()
    fireEvent.keyDown(postsTab, {key: 'End'})
    expect(mediaTab).toHaveFocus()
  })

  it('appends validated cursor pages without resetting the active media tab or duplicating posts', async () => {
    const first: FeedPagePost = {id: '22222222-2222-4222-8222-222222222222', body: 'First post', languageCode: 'en', publishedAt: '2026-09-02T12:00:00.000Z', author: feedProfile, likeCount: 0, commentCount: 0, bookmarkCount: 0, shareCount: 0}
    const next: FeedPagePost = {id: '55555555-5555-4555-8555-555555555555', body: 'Next post', languageCode: 'en', publishedAt: '2026-09-01T12:00:00.000Z', author: feedProfile, likeCount: 0, commentCount: 0, bookmarkCount: 0, shareCount: 0, media: [{id: '66666666-6666-4666-8666-666666666666', type: 'image', url: 'https://media.example/next.webp', altText: 'Next image', width: 600, height: 600, aspectRatio: 1}]}
    const request = vi.fn().mockResolvedValue(Response.json({profile, followerCount: 0, posts: {items: [first, next], nextCursor: null}}))
    vi.stubGlobal('fetch', request)
    render(<PublicProfileContent labels={labels} locale="en" moreHref="/en/profiles/profile?cursor=next_cursor" result={{status: 'ok', data: {profile, followerCount: 0, posts: {items: [first], nextCursor: 'next_cursor'}}}} />)
    fireEvent.click(screen.getByRole('tab', {name: 'Media'}))
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))
    expect(request).toHaveBeenCalledWith(`/api/social/profiles/${profile.id}?cursor=next_cursor`, expect.objectContaining({credentials: 'same-origin'}))
    expect(await screen.findByRole('button', {name: 'Next image'})).toBeVisible()
    expect(screen.getByRole('tab', {name: 'Media'})).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', {name: 'Posts'}))
    expect(screen.getAllByText('First post')).toHaveLength(1)
    expect(screen.getByText('Next post')).toBeVisible()
  })

  it('closes the viewer from the backdrop and pulls escaped focus back into the dialog', () => {
    const post: FeedPagePost = {id: '22222222-2222-4222-8222-222222222222', body: 'Post', languageCode: 'en', publishedAt: '2026-09-02T12:00:00.000Z', author: feedProfile, likeCount: 0, commentCount: 0, bookmarkCount: 0, shareCount: 0, media: [{id: '33333333-3333-4333-8333-333333333333', type: 'image', url: 'https://media.example/one.webp', altText: 'Moon one', width: 800, height: 800, aspectRatio: 1}]}
    const {container} = render(<><button type="button">Outside</button><PublicProfileContent labels={labels} locale="en" result={{status: 'ok', data: {profile, followerCount: 0, posts: {items: [post], nextCursor: null}}}} /></>)
    fireEvent.click(screen.getByRole('tab', {name: 'Media'}))
    fireEvent.click(screen.getByRole('button', {name: 'Moon one'}))
    screen.getByRole('button', {name: 'Outside'}).focus()
    expect(within(screen.getByRole('dialog')).getByRole('button', {name: 'Close'})).toHaveFocus()
    fireEvent.pointerDown(container.querySelector(`.${styles.viewerBackdrop}`)!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a complete media empty state without inventing assets', () => {
    render(<PublicProfileContent labels={labels} locale="en" result={{status: 'ok', data: {profile, followerCount: 0, posts: {items: [], nextCursor: null}}}} />)
    fireEvent.click(screen.getByRole('tab', {name: 'Media'}))
    expect(screen.getByRole('heading', {name: 'No media yet'})).toBeVisible()
    expect(screen.getByText('Images shared in posts appear here.')).toBeVisible()
    expect(document.querySelector(`.${styles.mediaThumbnail}`)).toBeNull()
  })

  it('uses PostCard for posts and preserves the unavailable result state', () => {
    const post: FeedPagePost = {id: '22222222-2222-4222-8222-222222222222', body: 'A real post', languageCode: 'en', publishedAt: '2026-08-31T12:00:00.000Z', author: feedProfile, likeCount: 0, commentCount: 0, bookmarkCount: 0, shareCount: 0}
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
    const {container} = render(<PublicProfileContent labels={labels} locale="en" result={{status: 'ok', data: {profile: longProfile, followerCount: 12, viewerFollows: false, posts: {items: [], nextCursor: null}}}} viewerScope="viewer-a" />)
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
    expect(stylesheet).toMatch(/\.profileSurface\s*\{[^}]*min-height:\s*0[^}]*min-width:\s*0[^}]*overflow-y:\s*auto[^}]*scrollbar-width:\s*none/)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\)[\s\S]*?\.profileSurface\s*\{[^}]*background:\s*var\(--shell-surface\)[^}]*border:\s*1px solid var\(--shell-border\)[^}]*border-radius:\s*16px/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\)[\s\S]*?\.contextualTitle\s*\{[\s\S]*?position:\s*sticky/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\)[\s\S]*?\.profileSurface\s*\{[\s\S]*?border:\s*0[\s\S]*?border-radius:\s*0/)
    expect(stylesheet).toMatch(/\.avatar\s*\{[\s\S]*?height:\s*(?:8[0-9]|9[0-9]|1\d{2})px[\s\S]*?width:\s*(?:8[0-9]|9[0-9]|1\d{2})px/)
    expect(stylesheet).toMatch(/\.profile\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0,\s*1fr\)[\s\S]*?overflow:\s*hidden/)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\)[\s\S]*?\.profile\s*\{[\s\S]*?height:\s*calc\(100dvh - 32px\)/)
    expect(stylesheet).toMatch(/\.more\s*:global\(\.global-more-menu\)\s*\{[\s\S]*?bottom:\s*auto[\s\S]*?right:\s*0/)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\)[\s\S]*?\.more\s*\{[\s\S]*?display:\s*none/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\)[\s\S]*?\.contextualTitle\s*\{[\s\S]*?padding-top:\s*max\([^;]*safe-area-inset-top/)
    expect(stylesheet).toMatch(/overflow-wrap:\s*anywhere/)
    expect(stylesheet).toMatch(/min-height:\s*44px/)
    expect(stylesheet).not.toMatch(/@media \(max-width: 359px\)[\s\S]*?\.profileActions\s*\{[\s\S]*?grid-template-columns/)
    expect(stylesheet).toMatch(/\.interaction-error:not\(:empty\)/)
    expect(stylesheet).not.toMatch(/\.interaction-error\)\s*\{\s*min-height/)
  })
})
