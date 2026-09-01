import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {MobileNav} from './MobileNav.js'
import en from '../../messages/en.json'

const labels = en

describe('MobileNav', () => {
  it('uses the strict five-destination mobile order', () => {
    render(<MobileNav labels={labels} locale="en" />)

    expect(screen.getAllByRole('link').map((link) => link.getAttribute('aria-label')))
      .toEqual(['Home', 'Messages', 'Creator Center', 'Activity', 'My Profile'])
    expect(screen.getByRole('link', {name: 'Activity'})).toHaveAttribute('href', '/en/activity')
  })

  it('does not show Creator when creator mode is disabled', () => {
    const {container} = render(<MobileNav creatorModeEnabled={false} labels={labels} locale="en" />)
    expect(screen.queryByRole('link', {name: en.creatorCenter})).toBeNull()
    expect(container.querySelector('.mobile-nav')).toHaveAttribute('data-count', '4')
  })

  it('marks Activity as the active destination on the activity route', () => {
    render(<MobileNav labels={labels} locale="en" />)
    expect(screen.getByRole('link', {name: 'Activity'})).toHaveAttribute('href', '/en/activity')
  })
})
