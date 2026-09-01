import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {AppNav} from './AppNav.js'

const {search} = vi.hoisted(() => ({search: new URLSearchParams()}))
vi.mock('next/navigation', () => ({usePathname: () => '/en', useSearchParams: () => search}))
vi.mock('next/link', () => ({default: ({children, ...props}: {children: React.ReactNode; [key: string]: unknown}) => <a {...props}>{children}</a>}))

const labels = {primary: 'Primary', home: 'Home', forYou: 'For You', following: 'Following', search: 'Search', notifications: 'Activity', messages: 'Messages', bookmarks: 'Saved', profile: 'My Profile', settings: 'Settings', creatorNav: 'Creator Center', recommendations: 'Recommendations', recommendationsEmpty: 'None', more: 'More', appearance: 'Appearance', contact: 'Contact Us', signOut: 'Sign Out', contactUnavailable: 'Contact is unavailable'}

describe('AppNav', () => {
  it('keeps Home feed choices in the desktop sidebar without a human composer', () => {
    render(<AppNav labels={labels} locale="en" />)

    expect(screen.getByRole('link', {name: 'For You'})).toHaveAttribute('href', '/en')
    expect(screen.getByRole('link', {name: 'Following'})).toHaveAttribute('href', '/en?feed=following')
    expect(screen.queryByRole('button', {name: /post|compose|publish/i})).toBeNull()
  })

  it('marks only Following active for a following query and exposes rail labels', () => {
    search.set('feed', 'following')
    render(<AppNav compact labels={labels} locale="en" />)
    expect(screen.getByRole('link', {name: 'Following'})).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', {name: 'For You'})).not.toHaveAttribute('aria-current')
    search.delete('feed')
  })

  it('provides separate full and compact logo variants for responsive CSS', () => {
    const {container} = render(<AppNav labels={labels} locale="en" />)
    expect(container.querySelector('.brand-logo-full')).toBeTruthy()
    expect(container.querySelector('.brand-logo-compact')).toBeTruthy()
  })
})
