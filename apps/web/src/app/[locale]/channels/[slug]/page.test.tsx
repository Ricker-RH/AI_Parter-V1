import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {fetchChannel, fetchChannelPosts, getOptionalPageAccess, notFound} = vi.hoisted(() => ({
  fetchChannel: vi.fn(), fetchChannelPosts: vi.fn(), getOptionalPageAccess: vi.fn(), notFound: vi.fn(() => {throw new Error('NOT_FOUND')}),
}))
vi.mock('../../../../lib/channels-api.js', () => ({fetchChannel, fetchChannelPosts}))
vi.mock('../../../../lib/auth/access-policy.js', () => ({getOptionalPageAccess}))
vi.mock('next/navigation', () => ({notFound, useRouter: () => ({refresh: vi.fn()})}))
vi.mock('next/link', () => ({default: ({children, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>}))
vi.mock('../../../../components/social/PostCard.js', () => ({PostCard: ({post}: {post: {body: string}}) => <article>{post.body}</article>}))

import ChannelDetailPage from './page.js'

const ip = {kind: 'ip' as const, id: '11111111-1111-4111-8111-111111111111', username: 'luma', displayName: 'Luma', languages: ['en'], visualType: 'realistic' as const}
const channel = {id: '22222222-2222-4222-8222-222222222222', slug: 'future-city', name: 'Future City', description: 'Urban futures', imageUrl: null, ipCount: 1, recommendedIps: [ip]}
const post = {id: '33333333-3333-4333-8333-333333333333', body: 'A walkable tomorrow', languageCode: 'en', publishedAt: '2026-09-04T00:00:00.000Z', author: ip, likeCount: 0, commentCount: 0, bookmarkCount: 0, shareCount: 0}

describe('channel detail route', () => {
  beforeEach(() => {
    fetchChannel.mockReset().mockResolvedValue({status: 'ok', data: channel})
    fetchChannelPosts.mockReset().mockResolvedValue({status: 'ok', data: {items: [post], nextCursor: 'more'}})
    getOptionalPageAccess.mockReset().mockResolvedValue({status: 'anonymous'})
  })

  it('renders the shared framed detail surface with channel actions, server-ordered IPs, and PostCard content', async () => {
    render(await ChannelDetailPage({params: Promise.resolve({locale: 'en', slug: 'future-city'}), searchParams: Promise.resolve({})}))
    expect(document.querySelector('[data-social-surface]')).not.toBeNull()
    expect(document.querySelector('[data-social-surface-frame]')).not.toBeNull()
    expect(screen.getByRole('button', {name: 'Back to channels'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'More'})).toBeVisible()
    expect(screen.getAllByText('Future City')).toHaveLength(1)
    expect(screen.queryByText('Urban futures')).toBeNull()
    expect(screen.getByRole('heading', {name: 'Channel IPs'})).toBeVisible()
    expect(screen.getByRole('link', {name: 'View all'})).toHaveAttribute('href', '/en/channels/future-city/profiles')
    expect(screen.getByRole('article')).toHaveTextContent('A walkable tomorrow')
    expect(screen.queryByText(/latest content/i)).toBeNull()
    expect(screen.getByRole('link', {name: 'Load more'})).toHaveAttribute('href', '/en/channels/future-city?cursor=more')
    expect(fetchChannelPosts).toHaveBeenCalledWith('future-city', {})
  })

  it('uses an optional viewer token without making the public channel sign-in-only', async () => {
    getOptionalPageAccess.mockResolvedValue({status: 'authenticated', token: 'viewer-jwt', viewerScope: 'viewer-a'})
    await ChannelDetailPage({params: Promise.resolve({locale: 'en', slug: 'future-city'}), searchParams: Promise.resolve({cursor: 'page-2'})})
    expect(fetchChannelPosts).toHaveBeenCalledWith('future-city', {cursor: 'page-2', token: 'viewer-jwt'})
  })

  it('turns missing and archived channel responses into the locale 404', async () => {
    fetchChannel.mockResolvedValue({status: 'not-found'})
    await expect(ChannelDetailPage({params: Promise.resolve({locale: 'zh-CN', slug: 'archived'}), searchParams: Promise.resolve({})})).rejects.toThrow('NOT_FOUND')
  })

  it('keeps an archive race from degrading into a generic post error', async () => {
    fetchChannelPosts.mockResolvedValue({status: 'not-found'})
    await expect(ChannelDetailPage({params: Promise.resolve({locale: 'en', slug: 'future-city'}), searchParams: Promise.resolve({})})).rejects.toThrow('NOT_FOUND')
  })

  it('shows retryable channel and empty-content states', async () => {
    fetchChannel.mockResolvedValueOnce({status: 'unavailable'})
    const failed = render(await ChannelDetailPage({params: Promise.resolve({locale: 'en', slug: 'future-city'}), searchParams: Promise.resolve({})}))
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load this channel')
    failed.unmount()
    fetchChannel.mockResolvedValue({status: 'ok', data: channel})
    fetchChannelPosts.mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
    render(await ChannelDetailPage({params: Promise.resolve({locale: 'en', slug: 'future-city'}), searchParams: Promise.resolve({})}))
    expect(screen.getByRole('heading', {name: 'No posts in this channel yet'})).toBeVisible()
  })
})
