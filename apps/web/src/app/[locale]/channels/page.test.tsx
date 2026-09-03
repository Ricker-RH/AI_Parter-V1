import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import en from '../../../../messages/en.json'
import zh from '../../../../messages/zh-CN.json'

const {fetchChannels, notFound} = vi.hoisted(() => ({fetchChannels: vi.fn(), notFound: vi.fn(() => {throw new Error('NOT_FOUND')})}))
vi.mock('../../../lib/channels-api.js', () => ({fetchChannels}))
vi.mock('next/navigation', () => ({notFound, useRouter: () => ({refresh: vi.fn(), replace: vi.fn()})}))

import ChannelDirectoryPage from './page.js'

describe('channel directory route', () => {
  beforeEach(() => fetchChannels.mockReset().mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}}))

  it('keeps complete bilingual channel-page copy parity', () => {
    expect(Object.keys(en.channelPages).sort()).toEqual(Object.keys(zh.channelPages).sort())
    expect(en.channelPages.description).not.toBe(zh.channelPages.description)
  })

  it('uses the shared social surface without the channel description and delegates q/cursor to the authoritative server read', async () => {
    render(await ChannelDirectoryPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({q: 'future', cursor: 'next'})}))
    const heading = screen.getByRole('heading', {level: 1, name: 'Channels'})
    expect(heading).toHaveClass('page-title')
    expect(heading.closest('.page-header')).not.toBeNull()
    expect(document.querySelector('[data-social-surface]')).not.toBeNull()
    expect(document.querySelector('[data-social-surface-frame]')).not.toBeNull()
    expect(screen.queryByText('Discover AI/IP worlds by topic.')).not.toBeInTheDocument()
    expect(fetchChannels).toHaveBeenCalledWith({q: 'future', cursor: 'next'})
    expect(screen.getByRole('searchbox', {name: 'Search channels'})).toHaveValue('future')
  })

  it('drops duplicate or non-string search parameters and rejects invalid locales', async () => {
    await ChannelDirectoryPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({q: ['one', 'two'], cursor: ['bad']})})
    expect(fetchChannels).toHaveBeenCalledWith({})
    await expect(ChannelDirectoryPage({params: Promise.resolve({locale: 'fr'}), searchParams: Promise.resolve({})})).rejects.toThrow('NOT_FOUND')
  })
})
