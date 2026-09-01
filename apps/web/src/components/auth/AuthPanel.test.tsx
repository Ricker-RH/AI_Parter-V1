import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
const provider = vi.hoisted(() => ({
  getSession: vi.fn(),
  signIn: {email: vi.fn(), social: vi.fn()},
  signUp: {email: vi.fn()},
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}))

vi.mock('@neondatabase/auth/next', () => ({createAuthClient: () => provider}))

import {AuthPanel, createBrowserAuthActions, type AuthActions} from './AuthPanel.js'

const actions = (): AuthActions => ({
  getSession: vi.fn().mockResolvedValue({user: null}),
  signInEmail: vi.fn().mockResolvedValue(null),
  signUpEmail: vi.fn().mockResolvedValue(null),
  signInGoogle: vi.fn().mockResolvedValue(null),
  signOut: vi.fn().mockResolvedValue(null),
  requestPasswordReset: vi.fn().mockResolvedValue(null),
  resetPassword: vi.fn().mockResolvedValue(null),
})

describe('AIFANS auth panel', () => {
  it('hands the safe admin callback to the auth provider with the credential request', async () => {
    provider.signIn.email.mockResolvedValue({error: {message: 'test stop'}})
    provider.signUp.email.mockResolvedValue({error: {message: 'test stop'}})
    const client = await createBrowserAuthActions('en')

    await client.signInEmail('luna@example.com', 'strong-password', '/en/admin')
    await client.signUpEmail('Luna', 'luna@example.com', 'strong-password', '/en/admin')

    expect(provider.signIn.email).toHaveBeenCalledWith({
      email: 'luna@example.com', password: 'strong-password', callbackURL: '/en/admin',
    })
    expect(provider.signUp.email).toHaveBeenCalledWith({
      name: 'Luna', email: 'luna@example.com', password: 'strong-password', callbackURL: '/en/admin',
    })
  })

  it('renders a bilingual-safe configuration state without fake session data', () => {
    render(<AuthPanel configured={false} locale="zh-CN" mode="sign-in" />)
    expect(screen.getByRole('heading', {name: '登录 AIFANS'})).toBeVisible()
    expect(screen.getByText('登录服务尚未配置')).toBeVisible()
    expect(screen.queryByText(/Luna/)).not.toBeInTheDocument()
  })

  it('submits email/password sign-in and offers Google OAuth', async () => {
    const client = actions()
    render(<AuthPanel actions={client} configured locale="en" mode="sign-in" returnTo="/en/admin" />)
    fireEvent.change(screen.getByLabelText('Email'), {target: {value: 'luna@example.com'}})
    fireEvent.change(screen.getByLabelText('Password'), {target: {value: 'strong-password'}})
    fireEvent.click(screen.getByRole('button', {name: 'Sign in'}))
    await waitFor(() => expect(client.signInEmail).toHaveBeenCalledWith('luna@example.com', 'strong-password', '/en/admin'))
    fireEvent.click(screen.getByRole('button', {name: 'Continue with Google'}))
    await waitFor(() => expect(client.signInGoogle).toHaveBeenCalledWith('/en/admin'))
    expect(screen.getByRole('link', {name: 'Create account'})).toHaveAttribute('href', '/en/auth/sign-up?next=%2Fen%2Fadmin')
  })

  it('collects a display name when registering', async () => {
    const client = actions()
    render(<AuthPanel actions={client} configured locale="zh-CN" mode="sign-up" />)
    fireEvent.change(screen.getByLabelText('昵称'), {target: {value: '露娜'}})
    fireEvent.change(screen.getByLabelText('邮箱'), {target: {value: 'luna@example.com'}})
    fireEvent.change(screen.getByLabelText('密码'), {target: {value: 'strong-password'}})
    fireEvent.click(screen.getByRole('button', {name: '创建账户'}))
    await waitFor(() => expect(client.signUpEmail).toHaveBeenCalledWith('露娜', 'luna@example.com', 'strong-password', undefined))
  })

  it('recovers from provider transport errors without leaving the form stuck', async () => {
    const client = actions()
    vi.mocked(client.signInEmail).mockRejectedValue(new Error('private provider detail'))
    render(<AuthPanel actions={client} configured locale="en" mode="sign-in" />)
    fireEvent.change(screen.getByLabelText('Email'), {target: {value: 'luna@example.com'}})
    fireEvent.change(screen.getByLabelText('Password'), {target: {value: 'strong-password'}})
    fireEvent.click(screen.getByRole('button', {name: 'Sign in'}))
    expect(await screen.findByText('Authentication could not be completed. Please try again.')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Sign in'})).toBeEnabled()
  })

  it('requests password recovery with a fixed same-origin callback and never reveals account existence', async () => {
    const client = actions()
    vi.mocked(client.requestPasswordReset).mockResolvedValue('provider rejected unknown email')
    render(<AuthPanel actions={client} configured locale="en" mode="forgot-password" />)
    fireEvent.change(screen.getByLabelText('Email'), {target: {value: 'unknown@example.com'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send reset link'}))
    await waitFor(() => expect(client.requestPasswordReset).toHaveBeenCalledWith(
      'unknown@example.com',
      `${window.location.origin}/en/auth/reset-password`,
    ))
    expect(screen.getByText('If an account exists for that email, a reset link has been sent.')).toBeVisible()
    expect(screen.queryByText(/unknown email/i)).not.toBeInTheDocument()
  })

  it('resets the password with only the callback token and shows a completed state', async () => {
    const client = actions()
    render(<AuthPanel actions={client} configured locale="zh-CN" mode="reset-password" resetToken="reset-token" />)
    fireEvent.change(screen.getByLabelText('新密码'), {target: {value: 'replacement-password'}})
    fireEvent.click(screen.getByRole('button', {name: '更新密码'}))
    await waitFor(() => expect(client.resetPassword).toHaveBeenCalledWith('replacement-password', 'reset-token'))
    expect(screen.getByText('密码已更新，请重新登录。')).toBeVisible()
    expect(screen.getByRole('link', {name: '返回登录'})).toHaveAttribute('href', '/zh-CN/auth/sign-in')
  })

  it('does not submit a reset when the callback token is absent', () => {
    const client = actions()
    render(<AuthPanel actions={client} configured locale="en" mode="reset-password" />)
    expect(screen.getByText('This password reset link is invalid or has expired.')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Update password'})).not.toBeInTheDocument()
    expect(client.resetPassword).not.toHaveBeenCalled()
  })
})
