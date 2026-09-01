import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {GlobalMoreMenu} from './GlobalMoreMenu.js'

const {getSession, createBrowserAuthActions} = vi.hoisted(() => ({getSession: vi.fn(async () => null), createBrowserAuthActions: vi.fn(async () => ({getSession, signOut: vi.fn(async () => null)}))}))
vi.mock('next/link', () => ({default: ({children, ...props}: {children: React.ReactNode; [key: string]: unknown}) => <a {...props}>{children}</a>}))
vi.mock('./auth/AuthPanel.js', () => ({createBrowserAuthActions}))

const labels = {more: 'More', appearance: 'Appearance', settings: 'Settings', contact: 'Contact Us', signOut: 'Sign Out', contactUnavailable: 'Contact is unavailable'}

describe('GlobalMoreMenu', () => {
  it('closes on Escape and restores focus to its trigger', () => {
    render(<GlobalMoreMenu authenticated labels={labels} locale="en" />)
    const trigger = screen.getByRole('button', {name: 'More'})
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
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
    expect(screen.getByRole('status')).toHaveTextContent('Contact is unavailable')
  })

  it('gives each menu its own id and supports menu key navigation', () => {
    render(<><GlobalMoreMenu labels={labels} locale="en"/><GlobalMoreMenu labels={labels} locale="en"/></>)
    const triggers = screen.getAllByRole('button', {name: 'More'})
    expect(triggers[0]?.getAttribute('aria-controls')).not.toBe(triggers[1]?.getAttribute('aria-controls'))
    fireEvent.keyDown(triggers[0]!, {key: 'ArrowDown'})
    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(items[0]!, {key: 'End'})
    expect(items[1]).toHaveFocus()
  })

  it('loads the session only when an unauthenticated menu is first opened', async () => {
    createBrowserAuthActions.mockClear()
    getSession.mockClear()
    render(<GlobalMoreMenu labels={labels} locale="en" />)
    expect(createBrowserAuthActions).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', {name: 'More'}))
    await vi.waitFor(() => expect(getSession).toHaveBeenCalledTimes(1))
  })
})
