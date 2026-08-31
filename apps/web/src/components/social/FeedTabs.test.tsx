import {fireEvent, render, screen} from '@testing-library/react'
import type {MouseEventHandler, ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {FeedTabs} from './FeedTabs.js'

const capture = vi.fn()
vi.mock('../../lib/analytics/provider.js', () => ({useAnalytics: () => ({capture, identify: vi.fn(), page: vi.fn(), reset: vi.fn()})}))
vi.mock('next/link', () => ({default: ({children, onClick, ...props}: {children: ReactNode; onClick: MouseEventHandler<HTMLAnchorElement>; [key: string]: unknown}) => <a {...props} onClick={(event) => { event.preventDefault(); onClick(event) }}>{children}</a>}))

describe('FeedTabs', () => {
  it('captures the real selected feed tab without a query payload', () => {
    render(<FeedTabs currentQuery="visualType=anime&campaign=launch&cursor=stale" following={false} labels={{forYou: 'For you', following: 'Following', home: 'Home'}} locale="en" />)
    expect(screen.getByRole('tab', {name: 'For you'})).toHaveAttribute('href', '/en?visualType=anime&campaign=launch')
    expect(screen.getByRole('tab', {name: 'Following'})).toHaveAttribute('href', '/en?visualType=anime&campaign=launch&feed=following')
    fireEvent.click(screen.getByRole('tab', {name: 'Following'}))
    expect(capture).toHaveBeenCalledWith({name: 'feed_tab_selected', properties: {event_version: 1, feed: 'following', locale: 'en'}})
    expect(JSON.stringify(capture.mock.calls)).not.toContain('cursor')
  })
})
