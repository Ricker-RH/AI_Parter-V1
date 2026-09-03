import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {fetchChannel, fetchChannelIps, notFound} = vi.hoisted(() => ({fetchChannel: vi.fn(), fetchChannelIps: vi.fn(), notFound: vi.fn(() => {throw new Error('NOT_FOUND')})}))
vi.mock('../../../../../lib/channels-api.js', () => ({fetchChannel, fetchChannelIps}))
vi.mock('next/navigation', () => ({notFound, useRouter: () => ({refresh: vi.fn()})}))

import ChannelProfilesPage from './page.js'

const channel = {id: '22222222-2222-4222-8222-222222222222', slug: 'future-city', name: 'Future City', description: '', imageUrl: null, ipCount: 0, recommendedIps: []}
const ip = {kind: 'ip', id: '11111111-1111-4111-8111-111111111111', username: 'luma', displayName: 'Luma', bio: 'Researcher', languages: ['en'], visualType: 'realistic'}

describe('channel profiles route', () => {
  beforeEach(() => {fetchChannel.mockReset().mockResolvedValue({status: 'ok', data: channel}); fetchChannelIps.mockReset().mockResolvedValue({status: 'ok', data: {items: [ip], nextCursor: 'next'}})})

  it('renders a capped single-list page and preserves server pagination', async () => {
    render(await ChannelProfilesPage({params: Promise.resolve({locale: 'en', slug: 'future-city'}), searchParams: Promise.resolve({cursor: 'current'})}))
    expect(screen.getByRole('heading', {name: 'Future City IPs'})).toBeVisible()
    expect(screen.getByRole('link', {name: 'Back to Future City'})).toHaveAttribute('href', '/en/channels/future-city')
    expect(fetchChannelIps).toHaveBeenCalledWith('future-city', {cursor: 'current'})
    expect(screen.getByRole('link', {name: 'Load more'})).toHaveAttribute('href', '/en/channels/future-city/profiles?cursor=next')
  })

  it('uses 404 for a missing or archived channel', async () => {
    fetchChannel.mockResolvedValue({status: 'not-found'})
    await expect(ChannelProfilesPage({params: Promise.resolve({locale: 'en', slug: 'archived'}), searchParams: Promise.resolve({})})).rejects.toThrow('NOT_FOUND')
  })

  it('keeps an archive race from degrading into a generic profiles error', async () => {
    fetchChannelIps.mockResolvedValue({status: 'not-found'})
    await expect(ChannelProfilesPage({params: Promise.resolve({locale: 'en', slug: 'future-city'}), searchParams: Promise.resolve({})})).rejects.toThrow('NOT_FOUND')
  })
})
