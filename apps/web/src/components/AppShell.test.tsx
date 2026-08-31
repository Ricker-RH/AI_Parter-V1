import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {AppShell} from './AppShell.js'

const labels = {
  primary: 'Primary', home: 'Home', search: 'Search', notifications: 'Notifications',
  messages: 'Messages', bookmarks: 'Bookmarks', profile: 'Profile', settings: 'Settings',
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
    render(<AppShell locale="zh-CN" labels={labels}><main>内容</main></AppShell>)
    expect(screen.getAllByRole('link', {name: 'Home'})[0]).toHaveAttribute('href', '/zh-CN')
    expect(screen.getAllByRole('link', {name: 'Messages'})[0]).toHaveAttribute('href', '/zh-CN/messages')
  })
})
