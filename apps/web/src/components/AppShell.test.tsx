import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

let pathname = '/en'
vi.mock('next/navigation', () => ({usePathname: () => pathname, useSearchParams: () => new URLSearchParams()}))
import {AppShell} from './AppShell.js'

const labels = {
  primary: 'Primary', home: 'Home', search: 'Search', notifications: 'Notifications',
  messages: 'Messages', bookmarks: 'Bookmarks', profile: 'Profile', settings: 'Settings',
  creatorNav: 'Creator',
  recommendations: 'Recommendations', recommendationsEmpty: 'No recommendations yet', more: 'More',
}

describe('AppShell', () => {
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

  it('selects the compact, recommendation-free messages shell', () => {
    pathname = '/en/messages'
    render(<AppShell locale="en" labels={labels}><main>Inbox</main></AppShell>)
    expect(document.querySelector('[data-shell="messages"]')).toHaveAttribute('data-nav-variant', 'compact')
    expect(document.querySelector('.messages-shell')).toHaveClass('shell')
    expect(document.querySelector('.desktop-nav-compact')).toBeInTheDocument()
    expect(document.querySelector('.messages-shell .mobile-nav')).toBeInTheDocument()
    const compactSearch = document.querySelector('.desktop-nav-compact a[href="/en/search"]')
    expect(compactSearch).toHaveAttribute('aria-label', 'Search')
    expect(compactSearch?.querySelector('svg')).toBeInTheDocument()
    expect(compactSearch?.querySelector('.sr-only')).toHaveTextContent('Search')
    expect(screen.queryByText('Recommendations')).toBeNull()
  })

  it('selects the isolated creator shell', () => {
    pathname = '/en/creator'
    render(<AppShell locale="en" labels={labels}><main>Creator</main></AppShell>)
    expect(document.querySelector('[data-shell="creator"]')).toBeInTheDocument()
    expect(screen.queryByRole('link', {name: 'Search'})).toBeNull()
  })
})
