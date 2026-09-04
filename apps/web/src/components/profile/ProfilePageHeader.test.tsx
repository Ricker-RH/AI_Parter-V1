import {render, screen} from '@testing-library/react'
import {expect, it} from 'vitest'
import {ProfilePageHeader} from './ProfilePageHeader.js'

it('uses shared profile chrome without a search action', () => {
  render(<ProfilePageHeader backHref="/en" labels={{}} locale="en" username="luna" />)
  expect(screen.getByRole('link', {name: 'Back'})).toHaveAttribute('href', '/en')
  expect(screen.queryByRole('link', {name: 'Search'})).toBeNull()
})
