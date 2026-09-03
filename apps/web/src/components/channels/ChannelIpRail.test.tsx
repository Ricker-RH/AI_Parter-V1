import {render, screen} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import type {AnchorHTMLAttributes, ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'

vi.mock('next/link', () => ({default: ({children, ...props}: AnchorHTMLAttributes<HTMLAnchorElement> & {children: ReactNode}) => <a {...props}>{children}</a>}))

import {ChannelIpRail} from './ChannelIpRail.js'

const ips = [
  {kind: 'ip' as const, id: '11111111-1111-4111-8111-111111111111', username: 'luma', displayName: 'Luma', languages: ['en' as const], visualType: 'realistic' as const},
  {kind: 'ip' as const, id: '22222222-2222-4222-8222-222222222222', username: 'nova', displayName: 'Nova', languages: ['zh-CN' as const], visualType: 'anime' as const},
]

describe('ChannelIpRail', () => {
  it('preserves the server recommendation order and links View all to profiles', () => {
    render(<ChannelIpRail empty="No IPs in this channel yet" items={ips} labels={{title: 'Channel IPs', viewAll: 'View all'}} locale="en" profilesHref="/en/channels/future-city/profiles" />)
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['View all', 'Luma', 'Nova'])
    expect(screen.getByRole('link', {name: 'View all'})).toHaveAttribute('href', '/en/channels/future-city/profiles')
    expect(screen.getByRole('link', {name: 'Luma'})).toHaveAttribute('href', '/en/profiles/11111111-1111-4111-8111-111111111111')
  })

  it('shows a dedicated empty state without hiding the section title', () => {
    render(<ChannelIpRail empty="No IPs in this channel yet" items={[]} labels={{title: 'Channel IPs', viewAll: 'View all'}} locale="en" profilesHref="/en/channels/future-city/profiles" />)
    expect(screen.getByRole('heading', {name: 'Channel IPs'})).toBeVisible()
    expect(screen.getByText('No IPs in this channel yet')).toBeVisible()
    expect(screen.queryByRole('link', {name: 'View all'})).toBeNull()
  })

  it('uses one compact 8px-based vertical rhythm with adaptive page gutters', () => {
    const css = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/channels/ChannelPage.module.css' : 'apps/web/src/components/channels/ChannelPage.module.css', 'utf8')
    expect(css).toMatch(/\.ipSection\s*\{[^}]*padding:\s*12px 20px/)
    expect(css).toMatch(/\.ipRail\s*\{[^}]*margin-top:\s*8px[^}]*padding:\s*0 4px/)
    expect(css).toMatch(/\.ipCard\s*\{[^}]*min-height:\s*80px/)
    expect(css).toMatch(/@media \(max-width: 699px\)\s*\{[\s\S]*?\.ipSection\s*\{[^}]*padding-inline:\s*12px/)
    expect(css).not.toMatch(/@media \(max-width: 699px\)\s*\{[\s\S]*?\.(?:ipRail|ipCard)\s*\{/)
  })
})
