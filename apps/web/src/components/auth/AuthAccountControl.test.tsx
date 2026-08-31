import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {AuthAccountControl} from './AuthAccountControl.js'
import type {AuthActions} from './AuthPanel.js'

function actions(session: {user: {email: string}} | null): AuthActions {
  return {
    getSession: vi.fn().mockResolvedValue(session),
    signInEmail: vi.fn(), signUpEmail: vi.fn(), signInGoogle: vi.fn(),
    signOut: vi.fn().mockResolvedValue(null),
  }
}

describe('auth account control', () => {
  it('refreshes the session and signs the active account out', async () => {
    const client = actions({user: {email: 'luna@example.com'}})
    render(<AuthAccountControl actions={client} configured locale="en" />)
    expect(await screen.findByText('luna@example.com')).toBeVisible()
    fireEvent.click(screen.getByRole('button', {name: 'Sign out'}))
    await waitFor(() => expect(client.signOut).toHaveBeenCalled())
  })

  it('offers sign in without inventing an account for an anonymous session', async () => {
    render(<AuthAccountControl actions={actions(null)} configured locale="zh-CN" />)
    expect(await screen.findByRole('link', {name: '登录'})).toHaveAttribute('href', '/zh-CN/auth/sign-in')
  })
})
