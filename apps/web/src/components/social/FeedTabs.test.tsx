import {fireEvent, render, screen} from '@testing-library/react'
import type {MouseEventHandler, ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {FeedTabs} from './FeedTabs.js'

const capture = vi.fn()
vi.mock('../../lib/analytics/provider.js', () => ({useAnalytics: () => ({capture, identify: vi.fn(), page: vi.fn(), reset: vi.fn()})}))
vi.mock('next/link', () => ({default: ({children, onClick, ...props}: {children: ReactNode; onClick: MouseEventHandler<HTMLAnchorElement>; [key: string]: unknown}) => <a {...props} onClick={(event) => { event.preventDefault(); onClick(event) }}>{children}</a>}))

describe('FeedTabs', () => {
  it('uses combined mobile labels and removes stale cursors without replacing the other feed filter', () => {
    render(<FeedTabs currentQuery="visualType=anime&campaign=launch&cursor=stale" following={false} labels={{forYou: 'For you', following: 'Following', home: 'Home', allTypes: 'All', realistic: 'Realistic', anime: 'Anime'}} locale="en" visualType="anime" />)
    expect(screen.getByRole('tab', {name: 'For you · Anime'})).toBeVisible()
    fireEvent.click(screen.getByRole('tab', {name: 'Following · All'}))
    expect(screen.getByRole('menuitem', {name: 'Anime'})).toHaveAttribute('href', '/en?campaign=launch&feed=following&visualType=anime')
    fireEvent.click(screen.getByRole('menuitem', {name: 'Anime'}))
    expect(capture).toHaveBeenCalledWith({name: 'feed_tab_selected', properties: {event_version: 1, feed: 'following', locale: 'en'}})
    expect(JSON.stringify(capture.mock.calls)).not.toContain('cursor')
  })

  it('preserves the inactive selection over a page rerender without encoding it in the URL', () => {
    const {rerender} = render(<FeedTabs currentQuery="visualType=anime" following={false} labels={{forYou: 'For you', following: 'Following', home: 'Home', allTypes: 'All', realistic: 'Realistic', anime: 'Anime'}} locale="en" visualType="anime" />)
    rerender(<FeedTabs currentQuery="feed=following" following labels={{forYou: 'For you', following: 'Following', home: 'Home', allTypes: 'All', realistic: 'Realistic', anime: 'Anime'}} locale="en" visualType="all" />)
    expect(screen.getByRole('tab', {name: 'For you · Anime'})).toBeVisible()
  })
})
