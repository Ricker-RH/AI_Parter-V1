import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {MobileNav} from './MobileNav.js'

const labels = {
  primary: 'Primary', home: 'Home', search: 'Search', notifications: 'Notifications',
  messages: 'Messages', bookmarks: 'Bookmarks', profile: 'Profile', settings: 'Settings',
  recommendations: 'Recommendations', recommendationsEmpty: 'No recommendations yet', more: 'More',
}

describe('MobileNav', () => {
  it('reveals every remaining primary destination from the More menu', () => {
    render(<MobileNav labels={labels} locale="en" />)

    fireEvent.click(screen.getByRole('button', {name: 'More'}))

    expect(screen.getByRole('link', {name: 'Bookmarks'})).toHaveAttribute('href', '/en/bookmarks')
    expect(screen.getByRole('link', {name: 'Profile'})).toHaveAttribute('href', '/en/profile')
    expect(screen.getByRole('link', {name: 'Settings'})).toHaveAttribute('href', '/en/settings')
  })
})
