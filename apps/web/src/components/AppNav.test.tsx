import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {AppNav} from './AppNav.js'

vi.mock('next/navigation', () => ({usePathname: () => '/en', useSearchParams: () => new URLSearchParams()}))
vi.mock('next/link', () => ({default: ({children, ...props}: {children: React.ReactNode; [key: string]: unknown}) => <a {...props}>{children}</a>}))

const labels = {primary: 'Primary', home: 'Home', forYou: 'For You', following: 'Following', search: 'Search', notifications: 'Activity', messages: 'Messages', bookmarks: 'Saved', profile: 'My Profile', settings: 'Settings', creatorNav: 'Creator Center', recommendations: 'Recommendations', recommendationsEmpty: 'None', more: 'More', appearance: 'Appearance', contact: 'Contact Us', signOut: 'Sign Out', contactUnavailable: 'Contact is unavailable'}

describe('AppNav', () => {
  it('keeps Home feed choices in the desktop sidebar without a human composer', () => {
    render(<AppNav labels={labels} locale="en" />)

    expect(screen.getByRole('link', {name: 'For You'})).toHaveAttribute('href', '/en')
    expect(screen.getByRole('link', {name: 'Following'})).toHaveAttribute('href', '/en?feed=following')
    expect(screen.queryByRole('button', {name: /post|compose|publish/i})).toBeNull()
  })
})
