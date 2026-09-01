import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {GlobalMoreMenu} from './GlobalMoreMenu.js'

vi.mock('next/link', () => ({default: ({children, ...props}: {children: React.ReactNode; [key: string]: unknown}) => <a {...props}>{children}</a>}))

const labels = {more: 'More', appearance: 'Appearance', settings: 'Settings', contact: 'Contact Us', signOut: 'Sign Out', contactUnavailable: 'Contact is unavailable'}

describe('GlobalMoreMenu', () => {
  it('closes on Escape and restores focus to its trigger', () => {
    render(<GlobalMoreMenu authenticated labels={labels} locale="en" />)
    const trigger = screen.getByRole('button', {name: 'More'})
    fireEvent.click(trigger)
    expect(screen.getByRole('menuitem', {name: 'Sign Out'})).toBeVisible()
    fireEvent.keyDown(document, {key: 'Escape'})
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('uses an unavailable state when no public contact address is configured', () => {
    render(<GlobalMoreMenu labels={labels} locale="en" />)
    fireEvent.click(screen.getByRole('button', {name: 'More'}))
    expect(screen.getByRole('menuitem', {name: 'Contact Us'})).toBeDisabled()
  })
})
