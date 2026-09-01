import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {access, accountControl} = vi.hoisted(() => ({access: vi.fn(), accountControl: vi.fn(() => <section data-testid="account-control" />)}))

vi.mock('../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access}))
vi.mock('../../../components/auth/AuthAccountControl.js', () => ({AuthAccountControl: accountControl}))
vi.mock('../../../components/ThemeProvider.js', () => ({ThemeControls: () => <div data-testid="theme-controls" />}))

import SettingsPage from './page.js'

describe('settings page access', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    accountControl.mockClear()
  })

  it('requires authenticated access before it renders settings content', async () => {
    render(await SettingsPage({params: Promise.resolve({locale: 'en'})}))

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/settings'})
    expect(screen.getByTestId('account-control')).toBeVisible()
    expect(screen.getByTestId('theme-controls')).toBeVisible()
  })

  it('does not mount the session-reading account control when access is unavailable', async () => {
    access.mockResolvedValue({status: 'unavailable'})

    render(await SettingsPage({params: Promise.resolve({locale: 'en'})}))

    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.queryByTestId('account-control')).toBeNull()
    expect(screen.queryByTestId('theme-controls')).toBeNull()
  })
})

describe('settings appearance anchor', () => {
  it('provides the Global More appearance deep-link target', async () => {
    access.mockResolvedValue({status: 'authenticated', token: 'token'})

    render(await SettingsPage({params: Promise.resolve({locale: 'en'})}))

    expect(document.getElementById('appearance')).not.toBeNull()
  })
})
