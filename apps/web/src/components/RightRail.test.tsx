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
  it('keeps the honest empty recommendation message visible', () => {
    render(<RightRail labels={labels} />)
    expect(screen.getByRole('region', {name: 'Recommendations'})).toHaveTextContent('No recommendations yet')
    expect(screen.getByText('No recommendations yet', {selector: 'p'})).toBeVisible()
  })
})
