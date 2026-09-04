import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {AuthAccountControl} from './AuthAccountControl.js'
import type {AuthActions} from './AuthPanel.js'

function actions(session: {user: {email: string}} | null): AuthActions {
  return {
    getSession: vi.fn().mockResolvedValue(session),
    signInEmail: vi.fn(), signUpEmail: vi.fn(), signInGoogle: vi.fn(),
    signOut: vi.fn().mockResolvedValue(null),
    requestPasswordReset: vi.fn(), resetPassword: vi.fn(),
  }
}

describe('auth account control', () => {
  it('shows logout failure without hiding the signed-in account',async()=>{
    const client=actions({user:{email:'luna@example.com'}});vi.mocked(client.signOut).mockResolvedValue('Session revocation failed')
    render(<AuthAccountControl actions={client} configured locale="en"/>);fireEvent.click(await screen.findByRole('button',{name:'Sign out'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign out could not be completed')
    expect(screen.getByText('luna@example.com')).toBeVisible();expect(screen.queryByRole('link',{name:'Sign in'})).toBeNull()
  });
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
