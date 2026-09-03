import {fireEvent, render, screen} from '@testing-library/react'
import type {AnchorHTMLAttributes, ReactNode} from 'react'
import {readFileSync} from 'node:fs'
import {describe, expect, it, vi} from 'vitest'

const {refresh} = vi.hoisted(() => ({refresh: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({refresh})}))
vi.mock('next/link', () => ({default: ({children, ...props}: AnchorHTMLAttributes<HTMLAnchorElement> & {children: ReactNode}) => <a {...props}>{children}</a>}))

import {ChannelIpList} from './ChannelIpList.js'

const ip = {kind: 'ip' as const, id: '11111111-1111-4111-8111-111111111111', username: 'luma', displayName: 'Luma', bio: 'City systems researcher', languages: ['en' as const], visualType: 'realistic' as const}
const labels = {empty: 'No IPs yet', unavailable: 'Unable to load IPs', retry: 'Retry', retrying: 'Retrying…', loadMore: 'Load more'}

describe('ChannelIpList', () => {
  it('reuses the following-list information hierarchy and paginates in server order', () => {
    render(<ChannelIpList labels={labels} locale="en" moreHref="/en/channels/future-city/profiles?cursor=next" result={{status: 'ok', data: {items: [ip], nextCursor: 'next'}}} />)
    const row = screen.getByRole('link', {name: 'Luma'})
    expect(row).toHaveAttribute('href', '/en/profiles/11111111-1111-4111-8111-111111111111')
    expect(row).toHaveTextContent('@luma')
    expect(row).toHaveTextContent('City systems researcher')
    expect(screen.getByRole('link', {name: 'Load more'})).toHaveAttribute('href', '/en/channels/future-city/profiles?cursor=next')
    const css = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/channels/ChannelPage.module.css' : 'apps/web/src/components/channels/ChannelPage.module.css', 'utf8')
    expect(css).toMatch(/\.ipRow\s*\{[^}]*padding:\s*12px 20px/)
    expect(css).toMatch(/@media \(max-width: 699px\)\s*\{[\s\S]*?\.ipRow\s*\{[^}]*padding-inline:\s*12px/)
  })

  it('covers empty and unavailable/retry states', () => {
    const {rerender} = render(<ChannelIpList labels={labels} locale="en" result={{status: 'ok', data: {items: [], nextCursor: null}}} />)
    expect(screen.getByRole('heading', {name: 'No IPs yet'})).toBeVisible()
    rerender(<ChannelIpList labels={labels} locale="en" result={{status: 'unavailable'}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load IPs')
    fireEvent.click(screen.getByRole('button', {name: 'Retry'}))
    expect(refresh).toHaveBeenCalledOnce()
  })
})
