import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {MobileTopBar} from './MobileTopBar.js'

vi.mock('next/link', () => ({default: ({children, ...props}: {children: React.ReactNode; [key: string]: unknown}) => <a {...props}>{children}</a>}))

describe('MobileTopBar', () => {
  it('exposes More, AIFANS, and Search in that order', () => {
    const {container} = render(<MobileTopBar labels={{more: 'More', search: 'Search'}} locale="en" />)
    expect(screen.getByRole('button', {name: 'More'})).toBeVisible()
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual(['AIFANS', 'Search'])
    expect(screen.getByRole('button', {name: 'More'}).querySelector('svg')).not.toBeNull()
    expect(container.querySelector('.mobile-brand svg')).toHaveAttribute('viewBox', '0 0 64 64')
  })
})
