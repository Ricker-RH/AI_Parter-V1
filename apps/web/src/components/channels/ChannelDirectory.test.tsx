import {act, fireEvent, render, screen} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import type {AnchorHTMLAttributes, ReactNode} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {refresh, replace} = vi.hoisted(() => ({refresh: vi.fn(), replace: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({refresh, replace})}))
vi.mock('next/link', () => ({default: ({children, ...props}: AnchorHTMLAttributes<HTMLAnchorElement> & {children: ReactNode}) => <a {...props}>{children}</a>}))

import {ChannelDirectory, type ChannelDirectoryLabels} from './ChannelDirectory.js'

const labels: ChannelDirectoryLabels = {
  searchLabel: 'Search channels', searchPlaceholder: 'Search channels', ipCount: '{count} IPs',
  emptyTitle: 'No channels yet', emptyDescription: 'Published channels appear here.',
  noResultsTitle: 'No matching channels', noResultsDescription: 'Try another phrase.', clearSearch: 'Clear search',
  unavailableTitle: 'Unable to load channels', unavailableDescription: 'Try again later.', retry: 'Retry', retrying: 'Retrying…',
}
const channel = {id: '11111111-1111-4111-8111-111111111111', slug: 'future-city', name: 'Future City', description: 'Urban futures', imageUrl: null, ipCount: 3}

describe('ChannelDirectory', () => {
  beforeEach(() => {vi.useFakeTimers(); replace.mockReset(); refresh.mockReset()})
  afterEach(() => vi.useRealTimers())

  it('keeps the approved mobile rail, medium directory, and readable detail width contracts', () => {
    const css = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/channels/ChannelPage.module.css' : 'apps/web/src/components/channels/ChannelPage.module.css', 'utf8')
    expect(css).toMatch(/\.ipRail\s*\{[^}]*overflow-x:\s*auto/)
    expect(css).toMatch(/@media \(min-width:\s*700px\)\s*\{[\s\S]*?\.directoryGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
    expect(css).toMatch(/\.detailInner\s*\{[^}]*max-width:\s*640px/)
  })

  it('renders compact localized channel entries and server pagination links', () => {
    render(<ChannelDirectory labels={labels} locale="en" query="" result={{status: 'ok', data: {items: [channel], nextCursor: 'next page'}}} />)
    expect(screen.getByRole('link', {name: /Future City/})).toHaveAttribute('href', '/en/channels/future-city')
    expect(screen.getByText('Urban futures')).toBeVisible()
    expect(screen.getByText('3 IPs')).toBeVisible()
    expect(screen.getByRole('link', {name: 'Load more'})).toHaveAttribute('href', '/en/channels?cursor=next+page')
  })

  it('debounces search for 300ms, synchronizes URL q, and never filters the loaded page locally', () => {
    render(<ChannelDirectory labels={labels} locale="en" query="" result={{status: 'ok', data: {items: [channel], nextCursor: null}}} />)
    fireEvent.change(screen.getByRole('searchbox', {name: 'Search channels'}), {target: {value: 'robots'}})
    expect(screen.getByText('Future City')).toBeVisible()
    act(() => vi.advanceTimersByTime(299))
    expect(replace).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(replace).toHaveBeenCalledWith('/en/channels?q=robots')
  })

  it('distinguishes an empty directory from no search results and clears q', () => {
    const {rerender} = render(<ChannelDirectory labels={labels} locale="en" query="" result={{status: 'ok', data: {items: [], nextCursor: null}}} />)
    expect(screen.getByRole('heading', {name: 'No channels yet'})).toBeVisible()
    rerender(<ChannelDirectory labels={labels} locale="en" query="robot" result={{status: 'ok', data: {items: [], nextCursor: null}}} />)
    expect(screen.getByRole('heading', {name: 'No matching channels'})).toBeVisible()
    fireEvent.click(screen.getByRole('button', {name: 'Clear search'}))
    expect(replace).toHaveBeenCalledWith('/en/channels')
  })

  it('shows an inline retry for unavailable data', () => {
    render(<ChannelDirectory labels={labels} locale="en" query="" result={{status: 'unavailable'}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load channels')
    fireEvent.click(screen.getByRole('button', {name: 'Retry'}))
    expect(refresh).toHaveBeenCalledOnce()
  })
})
