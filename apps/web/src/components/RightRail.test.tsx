import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {RightRail} from './RightRail.js'

const labels = {
  primary: 'Primary', home: 'Home', search: 'Search', notifications: 'Notifications',
  messages: 'Messages', bookmarks: 'Bookmarks', profile: 'Profile', settings: 'Settings',
  creatorNav: 'Creator',
  recommendations: 'Recommendations', recommendationsEmpty: 'No recommendations yet', more: 'More',
}

describe('RightRail', () => {
  it('applies the shared empty-state layout class', () => {
    render(<RightRail labels={labels} />)
    expect(screen.getByRole('region', {name: 'No recommendations yet'}).parentNode).toHaveClass('empty')
  })
})
