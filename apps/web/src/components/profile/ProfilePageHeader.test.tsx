import {render, screen} from '@testing-library/react'
import {expect, it} from 'vitest'
import {ProfilePageHeader} from './ProfilePageHeader.js'

it('uses shared profile chrome without generic search or overflow actions', () => {
  render(<ProfilePageHeader backHref="/en" labels={{}} locale="en" username="luna" />)
  expect(screen.getByRole('link', {name: 'Back'})).toHaveAttribute('href', '/en')
  expect(screen.queryByRole('link', {name: 'Search'})).toBeNull()
  expect(screen.queryByRole('button', {name: 'More'})).toBeNull()
})

it('renders only the profile-type action supplied by its caller', () => {
  render(<ProfilePageHeader actions={<button type="button">Share profile</button>} backHref="/en" labels={{}} locale="en" username="luna" />)
  expect(screen.getByRole('button', {name: 'Share profile'})).toBeVisible()
})
