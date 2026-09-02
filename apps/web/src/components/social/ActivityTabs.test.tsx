import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

vi.mock('next/link', () => ({default: ({children, ...props}: {children: React.ReactNode; [key: string]: unknown}) => <a data-next-link="true" {...props}>{children}</a>}))

import {ActivityTabs} from './ActivityTabs.js'

describe('ActivityTabs', () => {
  it('uses Next links for each internal activity destination', () => {
    render(<ActivityTabs labels={{activity: 'Activity', bookmarks: 'Saved', liked: 'Liked', notifications: 'Notifications'}} locale="en" selected="notifications" />)

    expect(screen.getByRole('link', {name: 'Notifications'})).toHaveAttribute('data-next-link', 'true')
    expect(screen.getByRole('link', {name: 'Notifications'})).toHaveAttribute('href', '/en/activity?tab=notifications')
    expect(screen.getByRole('link', {name: 'Liked'})).toHaveAttribute('data-next-link', 'true')
    expect(screen.getByRole('link', {name: 'Saved'})).toHaveAttribute('data-next-link', 'true')
  })
})
