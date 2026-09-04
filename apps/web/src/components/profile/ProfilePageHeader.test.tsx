import {render, screen} from '@testing-library/react'
import {readFileSync} from 'node:fs'
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

it('keeps the centered profile brand visible in both themes', () => {
  const stylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/social/PublicProfileContent.module.css' : 'apps/web/src/components/social/PublicProfileContent.module.css', 'utf8')
  expect(stylesheet).toMatch(/\.mobileBrand svg \{[\s\S]*?color:\s*currentColor[\s\S]*?\}/)
  expect(stylesheet).toMatch(/\.mobileBrand svg path:first-of-type \{\s*fill:\s*currentColor;/)
})
