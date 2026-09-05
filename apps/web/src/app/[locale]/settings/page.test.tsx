import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {access, accountControl, connection} = vi.hoisted(() => ({access: vi.fn(), accountControl: vi.fn(() => <section data-testid="account-control" />), connection: vi.fn()}))

vi.mock('../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access}))
vi.mock('../../../components/auth/AuthAccountControl.js', () => ({AuthAccountControl: accountControl}))
vi.mock('../../../components/ThemeProvider.js', () => ({ThemeControls: () => <div data-testid="theme-controls" />}))
vi.mock('next/server', () => ({connection}))

import * as settingsRoute from './page.js'

const SettingsPage = settingsRoute.default

describe('settings page access', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    accountControl.mockClear()
    connection.mockReset().mockResolvedValue(undefined)
  })

  it('keeps private settings access non-instant and waits for a request before auth', async () => {
    await SettingsPage({params: Promise.resolve({locale: 'en'})})

    expect(settingsRoute.instant).toBe(false)
    expect(connection).toHaveBeenCalledOnce()
    expect(connection.mock.invocationCallOrder[0]).toBeLessThan(access.mock.invocationCallOrder[0] ?? Infinity)
  })

  it('requires authenticated access before it renders settings content', async () => {
    render(await SettingsPage({params: Promise.resolve({locale: 'en'})}))

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/settings'})
    expect(screen.getByTestId('account-control')).toBeVisible()
    expect(screen.getByText('Appearance and language')).toBeVisible()
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
