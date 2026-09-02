import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {MobileNav} from './MobileNav.js'
import en from '../../messages/en.json'

const {pathname} = vi.hoisted(() => ({pathname: {value: '/en'}}))
vi.mock('next/navigation', () => ({usePathname: () => pathname.value}))

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
    pathname.value = '/en/activity'
    render(<MobileNav labels={labels} locale="en" />)
    expect(screen.getByRole('link', {name: 'Activity'})).toHaveAttribute('href', '/en/activity')
    expect(screen.getByRole('link', {name: 'Activity'})).toHaveAttribute('aria-current', 'page')
    pathname.value = '/en'
  })

  it('keeps Messages selected on a conversation detail route', () => {
    pathname.value = '/en/messages/11111111-1111-4111-8111-111111111111'
    render(<MobileNav labels={labels} locale="en" />)
    expect(screen.getByRole('link', {name: 'Messages'})).toHaveAttribute('aria-current', 'page')
    pathname.value = '/en'
  })
})
