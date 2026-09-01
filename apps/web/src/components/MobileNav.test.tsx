import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {MobileNav} from './MobileNav.js'

const labels = {
  primary: 'Primary', home: 'Home', search: 'Search',
  messages: 'Messages', bookmarks: 'Bookmarks', profile: 'My Profile', settings: 'Settings',
  creatorNav: 'Creator Center', notifications: 'Activity',
  recommendations: 'Recommendations', recommendationsEmpty: 'No recommendations yet', more: 'More',
}

describe('MobileNav', () => {
  it('uses the strict five-destination mobile order', () => {
    render(<MobileNav labels={labels} locale="en" />)

    expect(screen.getAllByRole('link').map((link) => link.getAttribute('aria-label')))
      .toEqual(['Home', 'Messages', 'Creator Center', 'Activity', 'My Profile'])
  })
})
