import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

let pathname = '/en'
vi.mock('next/navigation', () => ({usePathname: () => pathname}))
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
    expect(screen.queryByText('Recommendations')).toBeNull()
  })

  it('selects the isolated creator shell', () => {
    pathname = '/en/creator'
    render(<AppShell locale="en" labels={labels}><main>Creator</main></AppShell>)
    expect(document.querySelector('[data-shell="creator"]')).toBeInTheDocument()
    expect(screen.queryByRole('link', {name: 'Search'})).toBeNull()
  })
})
