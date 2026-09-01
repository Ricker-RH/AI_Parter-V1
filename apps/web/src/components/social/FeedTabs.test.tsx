import {fireEvent, render, screen} from '@testing-library/react'
import type {AnchorHTMLAttributes, MouseEventHandler, ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {FeedTabs} from './FeedTabs.js'

const capture = vi.fn()
vi.mock('../../lib/analytics/provider.js', () => ({useAnalytics: () => ({capture, identify: vi.fn(), page: vi.fn(), reset: vi.fn()})}))
vi.mock('next/link', () => ({default: ({children, onClick, ...props}: AnchorHTMLAttributes<HTMLAnchorElement> & {children: ReactNode}) => <a {...props} onClick={(event) => { event.preventDefault(); (onClick as MouseEventHandler<HTMLAnchorElement> | undefined)?.(event) }}>{children}</a>}))

describe('FeedTabs', () => {
  it('renders only For you and Following without visual-type controls', () => {
    render(<FeedTabs currentQuery="visualType=anime&campaign=launch&cursor=stale" following={false} labels={{forYou: 'For you', following: 'Following', home: 'Home'}} locale="en" />)

    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByRole('link', {name: 'For you'})).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', {name: 'Following'})).toHaveAttribute('href', '/en?campaign=launch&feed=following')
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByText('Anime')).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('preserves unrelated query values and removes stale feed state', () => {
    render(<FeedTabs currentQuery="feed=following&visualType=realistic&campaign=launch&campaign=return&cursor=stale" following labels={{forYou: 'For you', following: 'Following', home: 'Home'}} locale="en" />)

    expect(screen.getByRole('link', {name: 'For you'})).toHaveAttribute('href', '/en?campaign=launch&campaign=return')
    expect(screen.getByRole('link', {name: 'Following'})).toHaveAttribute('href', '/en?campaign=launch&campaign=return&feed=following')
  })

  it('tracks feed selection without leaking query values', () => {
    capture.mockClear()
    render(<FeedTabs currentQuery="visualType=anime&cursor=private" following={false} labels={{forYou: 'For you', following: 'Following', home: 'Home'}} locale="en" />)

    fireEvent.click(screen.getByRole('link', {name: 'Following'}))

    expect(capture).toHaveBeenCalledWith({name: 'feed_tab_selected', properties: {event_version: 1, feed: 'following', locale: 'en'}})
    expect(JSON.stringify(capture.mock.calls)).not.toContain('visualType')
    expect(JSON.stringify(capture.mock.calls)).not.toContain('cursor')
  })
})
