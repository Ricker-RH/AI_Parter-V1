import {fireEvent, render, screen, within} from '@testing-library/react'
import {act} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {GlobalMoreMenu} from './GlobalMoreMenu.js'

const {getSession, setTheme, signOut} = vi.hoisted(() => ({getSession: vi.fn(), setTheme: vi.fn(), signOut: vi.fn(async () => null)}))
vi.mock('next/link', () => ({default: ({children, ...props}: {children: React.ReactNode; [key: string]: unknown}) => <a {...props}>{children}</a>}))
vi.mock('next-themes', () => ({ThemeProvider: ({children}: {children: React.ReactNode}) => children, useTheme: () => ({theme: 'system', resolvedTheme: 'dark', setTheme})}))
vi.mock('./auth/AuthPanel.js', () => ({createBrowserAuthActions: vi.fn(async () => ({getSession, signOut}))}))

const labels = {
  more: 'More', appearance: 'Appearance', appearanceBack: 'Back', settings: 'Settings', contact: 'Contact Us',
  signOut: 'Sign Out', contactUnavailable: 'Contact is not configured', reportProblem: 'Report a problem',
  themeSystem: 'System', themeLight: 'Light', themeDark: 'Dark', close: 'Close',
  reportProblemTitle: 'Report a problem', reportProblemDescription: 'Tell us what happened.',
  reportCategory: 'Category', reportCategoryBug: 'Bug', reportCategorySafety: 'Safety', reportCategoryOther: 'Other',
  reportDetails: 'Details', reportDetailsPlaceholder: 'Describe the problem', reportContact: 'Contact email (optional)',
  reportContactPlaceholder: 'you@example.com', reportSubmit: 'Submit report', reportUnavailable: 'Reporting is not configured yet.',
  sessionChecking: 'Checking account…',
}

function openMenu(authenticated = false, props: Partial<React.ComponentProps<typeof GlobalMoreMenu>> = {}) {
  const result = render(<GlobalMoreMenu authenticated={authenticated} labels={labels} locale="en" {...props}/>)
  const trigger = screen.getByRole('button', {name: 'More'})
  fireEvent.click(trigger)
  return {...result, trigger}
}

describe('GlobalMoreMenu', () => {
  it('gives the icon trigger an explicit accessible name', () => {
    render(<GlobalMoreMenu labels={labels} locale="en"/>)
    expect(screen.getByRole('button', {name: 'More'})).toHaveAttribute('aria-label', 'More')
  })
  beforeEach(() => {
    getSession.mockReset()
    getSession.mockResolvedValue(null)
    setTheme.mockClear()
    signOut.mockClear()
  })

  it('renders the complete authenticated primary menu synchronously with a destructive sign out', () => {
    openMenu(true)
    const menu = screen.getByRole('menu', {name: 'More'})
    expect(within(menu).getAllByRole('menuitem').map((item) => item.getAttribute('aria-label') ?? item.textContent)).toEqual([
      'Appearance', 'Settings', 'Contact Us', 'Report a problem', 'Sign Out',
    ])
    expect(within(menu).getByRole('menuitem', {name: 'Sign Out'})).toHaveClass('global-more-sign-out')
  })

  it('never offers an invalid sign out to an anonymous visitor', () => {
    openMenu(false)
    expect(screen.queryByRole('menuitem', {name: 'Sign Out'})).toBeNull()
  })

  it('prefetches session state on mount and keeps a stable explicit slot until it resolves', async () => {
    let resolveSession!: (session: {user: {id: string}} | null) => void
    getSession.mockReturnValue(new Promise((resolve) => { resolveSession = resolve }))
    render(<GlobalMoreMenu labels={labels} locale="en"/>)
    await vi.waitFor(() => expect(getSession).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', {name: 'More'}))
    const pendingSignOut = screen.getByRole('menuitem', {name: 'Sign Out'})
    expect(pendingSignOut).toBeDisabled()
    expect(pendingSignOut).toHaveAttribute('aria-busy', 'true')
    expect(pendingSignOut).toHaveClass('global-more-sign-out')
    expect(screen.getByRole('menu')).toHaveClass('global-more-menu--primary')
    await act(async () => resolveSession({user: {id: 'real-user'}}))
    expect(await screen.findByRole('menuitem', {name: 'Sign Out'})).toBeVisible()
  })

  it('opens Appearance inside the same surface and applies a visibly selected theme', () => {
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', {name: 'Appearance'}))
    const menu = screen.getByRole('menu', {name: 'Appearance'})
    expect(within(menu).getByRole('menuitem', {name: 'Back'})).toBeVisible()
    expect(within(menu).queryByRole('link', {name: 'Settings'})).toBeNull()
    expect(within(menu).getByRole('menuitemradio', {name: 'System'})).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(menu).getByRole('menuitemradio', {name: 'Dark'}))
    expect(setTheme).toHaveBeenCalledWith('dark')
  })

  it('keeps Settings routed and renders honest configured and unconfigured Contact states', () => {
    const {unmount} = openMenu(false, {contactHref: 'mailto:support@example.com'})
    expect(screen.getByRole('menuitem', {name: 'Settings'})).toHaveAttribute('href', '/en/settings')
    expect(screen.getByRole('menuitem', {name: 'Contact Us'})).toHaveAttribute('href', 'mailto:support@example.com')
    unmount()

    openMenu()
    expect(screen.getByRole('menuitem', {name: 'Contact Us'})).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Contact is not configured')
  })

  it('opens an accessible report overlay with a disabled honest submission and restores focus on close', () => {
    openMenu()
    const reportTrigger = screen.getByRole('menuitem', {name: 'Report a problem'})
    fireEvent.click(reportTrigger)
    const dialog = screen.getByRole('dialog', {name: 'Report a problem'})
    expect(within(dialog).getByRole('button', {name: 'Close'})).toHaveFocus()
    expect(within(dialog).getByLabelText('Category')).toBeVisible()
    expect(within(dialog).getByLabelText('Details')).toBeVisible()
    expect(within(dialog).getByLabelText('Contact email (optional)')).toBeVisible()
    expect(within(dialog).getByRole('button', {name: 'Submit report'})).toBeDisabled()
    expect(within(dialog).getByRole('status')).toHaveTextContent('Reporting is not configured yet.')
    fireEvent.keyDown(dialog, {key: 'Escape'})
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(reportTrigger).toHaveFocus()
  })

  it('traps report focus in both tab directions', () => {
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', {name: 'Report a problem'}))
    const dialog = screen.getByRole('dialog')
    const close = within(dialog).getByRole('button', {name: 'Close'})
    const contact = within(dialog).getByLabelText('Contact email (optional)')
    fireEvent.keyDown(close, {key: 'Tab', shiftKey: true})
    expect(contact).toHaveFocus()
    fireEvent.keyDown(contact, {key: 'Tab'})
    expect(close).toHaveFocus()
  })

  it('closes on Escape and outside click, restores trigger focus, and supports Arrow/Home/End', () => {
    const {trigger} = openMenu(true)
    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(items[0]!, {key: 'End'})
    expect(items.at(-1)).toHaveFocus()
    fireEvent.keyDown(items.at(-1)!, {key: 'Home'})
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(items[0]!, {key: 'ArrowUp'})
    expect(items.at(-1)).toHaveFocus()
    fireEvent.keyDown(document, {key: 'Escape'})
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('signs out through the supplied authenticated action', () => {
    const onSignOut = vi.fn()
    openMenu(true, {onSignOut})
    fireEvent.click(screen.getByRole('menuitem', {name: 'Sign Out'}))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('gives each menu its own id', () => {
    render(<><GlobalMoreMenu labels={labels} locale="en"/><GlobalMoreMenu labels={labels} locale="en"/></>)
    const triggers = screen.getAllByRole('button', {name: 'More'})
    expect(triggers[0]?.getAttribute('aria-controls')).not.toBe(triggers[1]?.getAttribute('aria-controls'))
  })
})
