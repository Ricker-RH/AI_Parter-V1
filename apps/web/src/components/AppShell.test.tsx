import {fireEvent, render, screen} from '@testing-library/react'
import type {ReactNode} from 'react'
import {Suspense} from 'react'
import {describe, expect, it, vi} from 'vitest'
import nextConfig from '../../next.config.js'

let pathname = '/en'
let searchParams = new URLSearchParams()
let suspendPathname = false
vi.mock('next/navigation', () => ({usePathname: () => { if (suspendPathname) throw new Promise(() => undefined); return pathname }, useSearchParams: () => searchParams}))
import {AppShell} from './AppShell.js'

const labels = {
  primary: 'Primary', home: 'Home', search: 'Search', notifications: 'Notifications',
  channels: 'Channels', messages: 'Messages', bookmarks: 'Bookmarks', profile: 'Profile', settings: 'Settings',
  creatorNav: 'Creator',
  recommendations: 'Recommendations', recommendationsEmpty: 'No recommendations yet', more: 'More',
}

describe('AppShell', () => {
  it('enables Cache Components, Partial Prefetching, and manual instant validation', () => {
    expect(nextConfig.cacheComponents).toBe(true)
    expect(nextConfig.experimental?.instantInsights?.validationLevel).toBe('manual-warning')
    expect(nextConfig.partialPrefetching).toBe(true)
  })

  it('keeps the shared interactive shell visible while route data is pending', () => {
    pathname = '/en'
    render(<AppShell locale="en" labels={labels}><PendingRouteData/></AppShell>)
    expect(document.querySelector('[data-app-shell="shared-interactive"]')).toBeVisible()
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0)
    expect(screen.getByText('Route data fallback')).toBeVisible()
  })

  it('renders complete social navigation without a human compose action', () => {
    render(<AppShell locale="en" labels={labels}><main>Feed</main></AppShell>)
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0)
    expect(screen.getByText('Feed')).toBeVisible()
    expect(screen.queryByRole('button', {name: /post|publish|compose/i})).toBeNull()
  })

  it('prefixes navigation destinations with the selected locale', () => {
    pathname = '/zh-CN'
    render(<AppShell locale="zh-CN" labels={labels}><main>内容</main></AppShell>)
    expect(screen.getAllByRole('link', {name: 'Home'})[0]).toHaveAttribute('href', '/zh-CN')
    expect(screen.getAllByRole('link', {name: 'Messages'})[0]).toHaveAttribute('href', '/zh-CN/messages')
  })

  it('captures ordinary desktop and mobile navigation links for pending feedback', () => {
    pathname = '/en'
    render(<AppShell locale="en" labels={labels}><main>Feed</main></AppShell>)
    const messageLink = screen.getAllByRole('link', {name: 'Messages'})[0]
    if (!messageLink) throw new Error('Expected desktop Messages link')
    fireEvent.pointerDown(messageLink, {button: 0})
    expect(screen.getByRole('status')).toHaveAttribute('data-navigation-pending', 'true')
  })

  it('marks the ordinary public shell as a fluid layout without changing the messages variant', () => {
    pathname = '/en'
    const {unmount} = render(<AppShell locale="en" labels={labels}><main>Feed</main></AppShell>)
    expect(document.querySelector('[data-shell="public"]')).toHaveAttribute('data-layout', 'fluid')
    expect(document.querySelector('[data-shell="public"] .right-rail')).toHaveAttribute('data-priority', 'secondary')
    unmount()

    pathname = '/en/messages'
    render(<AppShell locale="en" labels={labels}><main>Inbox</main></AppShell>)
    expect(document.querySelector('[data-shell="messages"]')).not.toHaveAttribute('data-layout', 'fluid')
  })

  it('selects the isolated admin shell for admin routes', () => {
    pathname = '/en/admin'
    render(<AppShell authConfigured={false} locale="en" labels={labels}><main>Operations</main></AppShell>)
    expect(screen.getAllByRole('link', {name: 'Content operations'})[0]).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', {name: 'Search'})).toBeNull()
    expect(screen.queryByText('Recommendations')).toBeNull()
  })

  it('does not render ordinary navigation or recommendations on auth routes', () => {
    pathname = '/en/auth/sign-in'
    render(<AppShell locale="en" labels={labels}><main>Sign in</main></AppShell>)
    expect(screen.queryByRole('link', {name: 'Search'})).toBeNull()
    expect(screen.queryByText('Recommendations')).toBeNull()
  })

  it('omits the generic mobile More, AIFANS, and Search header for a post detail route', () => {
    pathname = '/en/posts/22222222-2222-4222-8222-222222222222'
    render(<AppShell locale="en" labels={labels}><main>Post</main></AppShell>)
    expect(document.querySelector('[data-shell="public"]')).toHaveAttribute('data-mobile-top-bar', 'hidden')
    expect(document.querySelector('.mobile-top-bar')).toBeNull()
  })

  it('omits the generic mobile header when a public profile supplies its own contextual header', () => {
    pathname = '/en/profiles/11111111-1111-4111-8111-111111111111'
    render(<AppShell locale="en" labels={labels}><main>Public profile</main></AppShell>)
    expect(document.querySelector('[data-shell="public"]')).toHaveAttribute('data-mobile-top-bar', 'hidden')
    expect(document.querySelector('.mobile-top-bar')).toBeNull()
  })

  it.each(['/en/channels', '/en/channels/future-city', '/en/channels/future-city/profiles'])('omits the generic mobile header throughout the Channels section at %s', (route) => {
    pathname = route
    render(<AppShell locale="en" labels={labels}><main>Channels</main></AppShell>)
    expect(document.querySelector('[data-shell="public"]')).toHaveAttribute('data-mobile-top-bar', 'hidden')
    expect(document.querySelector('.mobile-top-bar')).toBeNull()
  })

  it('selects the compact, recommendation-free messages shell', () => {
    pathname = '/en/messages'
    render(<AppShell locale="en" labels={labels}><main>Inbox</main></AppShell>)
    expect(document.querySelector('[data-shell="messages"]')).toHaveAttribute('data-nav-variant', 'compact')
    expect(document.querySelector('[data-shell="messages"]')).toHaveAttribute('data-mobile-top-bar', 'hidden')
    expect(document.querySelector('.messages-shell')).toHaveClass('shell')
    expect(document.querySelector('.desktop-nav-compact')).toBeInTheDocument()
    expect(document.querySelector('.messages-shell .mobile-nav')).toBeInTheDocument()
    const compactSearch = document.querySelector('.desktop-nav-compact a[href="/en/search"]')
    expect(compactSearch).toHaveAttribute('aria-label', 'Search')
    expect(compactSearch?.querySelector('svg')).toBeInTheDocument()
    expect(compactSearch?.querySelector('.sr-only')).toHaveTextContent('Search')
    expect(screen.queryByText('Recommendations')).toBeNull()
  })

  it('keeps Notifications inside the compact Messages shell', () => {
    pathname = '/en/notifications'
    render(<AppShell locale="en" labels={labels}><main>Notifications</main></AppShell>)
    expect(document.querySelector('[data-shell="messages"]')).toHaveAttribute('data-nav-variant', 'compact')
    expect(screen.getAllByRole('link', {name: 'Messages'})[0]).toHaveAttribute('aria-current', 'page')
  })

  it('selects the isolated creator shell', () => {
    pathname = '/en/creator'
    render(<AppShell locale="en" labels={labels}><main>Creator</main></AppShell>)
    expect(document.querySelector('[data-shell="creator"]')).toBeInTheDocument()
    expect(screen.queryByRole('link', {name: 'Search'})).toBeNull()
  })

  it.each([
    ['/en', true],
    ['/en/channels', true],
    ['/en/messages', true],
    ['/en/posts/post-1', false],
    ['/en/channels/channel-1', false],
    ['/en/messages/conversation-1', false],
    ['/en/profile', false],
    ['/en/activity', false],
    ['/en/creator', false],
  ] as const)('applies the shared floating creator route policy to %s', (route, visible) => {
    pathname = route
    render(<AppShell locale="en" labels={labels}><main>Route</main></AppShell>)
    expect(document.querySelectorAll('.floating-creator-action')).toHaveLength(visible ? 1 : 0)
  })

  it('mounts the floating creator action inside each primary content frame', () => {
    pathname = '/en'
    const {unmount} = render(<AppShell locale="en" labels={labels}><main>Home</main></AppShell>)
    expect(document.querySelector('[data-shell="public"] .content > .floating-creator-action')).not.toBeNull()
    unmount()

    pathname = '/en/messages'
    render(<AppShell locale="en" labels={labels}><main>Messages</main></AppShell>)
    expect(document.querySelector('[data-shell="messages"] .content > .floating-creator-action')).not.toBeNull()
  })

  it('preserves the complete primary-page origin in the creator action', () => {
    pathname = '/en'
    searchParams = new URLSearchParams({feed: 'following'})
    render(<AppShell locale="en" labels={labels}><main>Following</main></AppShell>)
    expect(document.querySelector('.floating-creator-action')).toHaveAttribute('href', '/en/creator?returnTo=%2Fen%3Ffeed%3Dfollowing')
    searchParams = new URLSearchParams()
  })

  it('provides both route-kind fallbacks while pathname resolution is pending', () => {
    suspendPathname = true
    const {container} = render(<AppShell locale="en" labels={labels}><main>Pending route</main></AppShell>)
    expect(container.querySelector('.route-shell-fallback-public .desktop-nav')).toBeInTheDocument()
    expect(container.querySelector('.route-shell-fallback-loading .loading-screen')).toBeInTheDocument()
    suspendPathname = false
  })
})

function PendingRouteData() {
  return <Suspense fallback={<main>Route data fallback</main>}><DeferredRouteData/></Suspense>
}

function DeferredRouteData(): ReactNode {
  throw new Promise(() => undefined)
}
