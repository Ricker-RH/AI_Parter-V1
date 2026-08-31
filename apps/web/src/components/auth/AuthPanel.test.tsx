import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {AuthPanel, type AuthActions} from './AuthPanel.js'

const actions = (): AuthActions => ({
  getSession: vi.fn().mockResolvedValue({user: null}),
  signInEmail: vi.fn().mockResolvedValue(null),
  signUpEmail: vi.fn().mockResolvedValue(null),
  signInGoogle: vi.fn().mockResolvedValue(null),
  signOut: vi.fn().mockResolvedValue(null),
})

describe('AIFANS auth panel', () => {
  it('renders a bilingual-safe configuration state without fake session data', () => {
    render(<AuthPanel configured={false} locale="zh-CN" mode="sign-in" />)
    expect(screen.getByRole('heading', {name: '登录 AIFANS'})).toBeVisible()
    expect(screen.getByText('登录服务尚未配置')).toBeVisible()
    expect(screen.queryByText(/Luna/)).not.toBeInTheDocument()
  })

  it('submits email/password sign-in and offers Google OAuth', async () => {
    const client = actions()
    render(<AuthPanel actions={client} configured locale="en" mode="sign-in" />)
    fireEvent.change(screen.getByLabelText('Email'), {target: {value: 'luna@example.com'}})
    fireEvent.change(screen.getByLabelText('Password'), {target: {value: 'strong-password'}})
    fireEvent.click(screen.getByRole('button', {name: 'Sign in'}))
    await waitFor(() => expect(client.signInEmail).toHaveBeenCalledWith('luna@example.com', 'strong-password'))
    fireEvent.click(screen.getByRole('button', {name: 'Continue with Google'}))
    await waitFor(() => expect(client.signInGoogle).toHaveBeenCalled())
  })

  it('collects a display name when registering', async () => {
    const client = actions()
    render(<AuthPanel actions={client} configured locale="zh-CN" mode="sign-up" />)
    fireEvent.change(screen.getByLabelText('昵称'), {target: {value: '露娜'}})
    fireEvent.change(screen.getByLabelText('邮箱'), {target: {value: 'luna@example.com'}})
    fireEvent.change(screen.getByLabelText('密码'), {target: {value: 'strong-password'}})
    fireEvent.click(screen.getByRole('button', {name: '创建账户'}))
    await waitFor(() => expect(client.signUpEmail).toHaveBeenCalledWith('露娜', 'luna@example.com', 'strong-password'))
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
})
