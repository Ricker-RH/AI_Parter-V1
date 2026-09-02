import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

vi.mock('next/link', () => ({default: ({children, ...props}: {children: React.ReactNode; [key: string]: unknown}) => <a data-next-link="true" {...props}>{children}</a>}))

import {ActivityTabs} from './ActivityTabs.js'

describe('ActivityTabs', () => {
  it('uses Next links for the compact Liked and Saved collection destinations', () => {
    render(<ActivityTabs labels={{collections: 'Collections', bookmarks: 'Saved', liked: 'Liked'}} locale="en" selected="liked" />)

    expect(screen.getByRole('link', {name: 'Liked'})).toHaveAttribute('data-next-link', 'true')
    expect(screen.getByRole('link', {name: 'Liked'})).toHaveAttribute('href', '/en/activity?tab=liked')
    expect(screen.getByRole('link', {name: 'Saved'})).toHaveAttribute('data-next-link', 'true')
    expect(screen.queryByRole('link', {name: 'Notifications'})).toBeNull()
  })
})
