'use client'

import Link from 'next/link'
import {useState, type FormEvent} from 'react'
import type {Locale} from '../../i18n/config'

export type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password'

export type AuthActions = {
  getSession(): Promise<{user: unknown} | null>
  signInEmail(email: string, password: string, returnTo?: string): Promise<string | null>
  signUpEmail(name: string, email: string, password: string, returnTo?: string): Promise<string | null>
  signInGoogle(returnTo?: string): Promise<string | null>
  signOut(): Promise<string | null>
  requestPasswordReset(email: string, redirectTo: string): Promise<string | null>
  resetPassword(newPassword: string, token: string): Promise<string | null>
}

type Labels = {
  title: Record<AuthMode, string>
  email: string
  password: string
  newPassword: string
  name: string
  submit: Record<AuthMode, string>
  google: string
  switchText: Record<'sign-in' | 'sign-up', string>
  switchLink: Record<'sign-in' | 'sign-up', string>
  forgotLink: string
  backToSignIn: string
  notConfigured: string
  error: string
  resetError: string
  invalidReset: string
  recoveryComplete: string
  resetComplete: string
  success: Record<'sign-in' | 'sign-up', string>
}

const translations: Record<Locale, Labels> = {
  en: {
    title: {
      'sign-in': 'Sign in to AIFANS',
      'sign-up': 'Create your AIFANS account',
      'forgot-password': 'Reset your password',
      'reset-password': 'Choose a new password',
    },
    email: 'Email', password: 'Password', newPassword: 'New password', name: 'Display name',
    submit: {
      'sign-in': 'Sign in',
      'sign-up': 'Create account',
      'forgot-password': 'Send reset link',
      'reset-password': 'Update password',
    },
    google: 'Continue with Google',
    switchText: {'sign-in': 'New to AIFANS?', 'sign-up': 'Already have an account?'},
    switchLink: {'sign-in': 'Create account', 'sign-up': 'Sign in'},
    forgotLink: 'Forgot password?', backToSignIn: 'Back to sign in',
    notConfigured: 'Authentication is not configured yet.',
    error: 'Authentication could not be completed. Please try again.',
    resetError: 'The password could not be updated. Request a new reset link and try again.',
    invalidReset: 'This password reset link is invalid or has expired.',
    recoveryComplete: 'If an account exists for that email, a reset link has been sent.',
    resetComplete: 'Password updated. Please sign in again.',
    success: {'sign-in': 'Signed in. Returning to AIFANS…', 'sign-up': 'Account created. Returning to AIFANS…'},
  },
  'zh-CN': {
    title: {
      'sign-in': '登录 AIFANS',
      'sign-up': '创建 AIFANS 账户',
      'forgot-password': '重置密码',
      'reset-password': '设置新密码',
    },
    email: '邮箱', password: '密码', newPassword: '新密码', name: '昵称',
    submit: {
      'sign-in': '登录',
      'sign-up': '创建账户',
      'forgot-password': '发送重置链接',
      'reset-password': '更新密码',
    },
    google: '使用 Google 继续',
    switchText: {'sign-in': '第一次使用 AIFANS？', 'sign-up': '已经有账户？'},
    switchLink: {'sign-in': '创建账户', 'sign-up': '登录'},
    forgotLink: '忘记密码？', backToSignIn: '返回登录',
    notConfigured: '登录服务尚未配置',
    error: '暂时无法完成身份验证，请重试。',
    resetError: '暂时无法更新密码，请重新申请重置链接后再试。',
    invalidReset: '密码重置链接无效或已过期。',
    recoveryComplete: '如果该邮箱对应账户，我们已发送密码重置链接。',
    resetComplete: '密码已更新，请重新登录。',
    success: {'sign-in': '登录成功，正在返回 AIFANS…', 'sign-up': '账户已创建，正在返回 AIFANS…'},
  },
}

function providerError(error: unknown): string | null {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : error ? 'error' : null
}

export async function createBrowserAuthActions(locale: Locale): Promise<AuthActions> {
  const {createAuthClient} = await import('@neondatabase/auth/next')
  const client = createAuthClient()
  const finish = (error: unknown, returnTo?: string) => {
    if (!error) window.location.assign(returnTo ?? `/${locale}`)
    return providerError(error)
  }
  return {
    async getSession() { const {data} = await client.getSession(); return data ?? null },
    async signInEmail(email, password, returnTo) { const callbackURL=returnTo??`/${locale}`;const {error} = await client.signIn.email({email, password, callbackURL}); return finish(error, callbackURL) },
    async signUpEmail(name, email, password, returnTo) { const callbackURL=returnTo??`/${locale}`;const {error} = await client.signUp.email({name, email, password, callbackURL}); return finish(error, callbackURL) },
    async signInGoogle(returnTo) { const {error} = await client.signIn.social({provider: 'google', callbackURL: returnTo ?? `/${locale}`}); return error ? finish(error, returnTo) : null },
    async signOut() { const {error} = await client.signOut(); return finish(error) },
    async requestPasswordReset(email, redirectTo) {
      const {error} = await client.requestPasswordReset({email, redirectTo})
      return providerError(error)
    },
    async resetPassword(newPassword, token) {
      const {error} = await client.resetPassword({newPassword, token})
      return providerError(error)
    },
  }
}

export function AuthPanel({
  configured,
  locale,
  mode,
  resetToken,
  returnTo,
  actions,
}: {
  configured: boolean
  locale: Locale
  mode: AuthMode
  resetToken?: string
  returnTo?: string
  actions?: AuthActions
}) {
  const labels = translations[locale]
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)

  async function client(): Promise<AuthActions> { return actions ?? createBrowserAuthActions(locale) }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!configured || pending) return
    setPending(true); setStatus(null)
    const data = new FormData(event.currentTarget)
    try {
      const api = await client()
      if (mode === 'forgot-password') {
        const redirectTo = new URL(`/${locale}/auth/reset-password`, window.location.origin).toString()
        await api.requestPasswordReset(String(data.get('email')), redirectTo)
        setCompleted(true)
        setStatus(labels.recoveryComplete)
      } else if (mode === 'reset-password') {
        if (!resetToken) return
        const error = await api.resetPassword(String(data.get('password')), resetToken)
        setCompleted(!error)
        setStatus(error ? labels.resetError : labels.resetComplete)
      } else {
        const error = mode === 'sign-in'
          ? await api.signInEmail(String(data.get('email')), String(data.get('password')), returnTo)
          : await api.signUpEmail(String(data.get('name')), String(data.get('email')), String(data.get('password')), returnTo)
        setStatus(error ? labels.error : labels.success[mode])
      }
    } catch {
      if (mode === 'forgot-password') {
        setCompleted(true)
        setStatus(labels.recoveryComplete)
      } else {
        setStatus(mode === 'reset-password' ? labels.resetError : labels.error)
      }
    } finally {
      setPending(false)
    }
  }

  async function google() {
    if (!configured || pending) return
    setPending(true); setStatus(null)
    try {
      const error = await (await client()).signInGoogle(returnTo)
      setStatus(error ? labels.error : labels.success['sign-in'])
    } catch {
      setStatus(labels.error)
    } finally {
      setPending(false)
    }
  }

  const standard = mode === 'sign-in' || mode === 'sign-up'
  const invalidReset = mode === 'reset-password' && !resetToken
  const showForm = configured && !completed && !invalidReset
  const authSwitchHref = `/${locale}/auth/${mode === 'sign-in' ? 'sign-up' : 'sign-in'}${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ''}`
  return <main className="auth-page"><section className="auth-card"><p className="auth-eyebrow">AIFANS / AUTH</p><h1>{labels.title[mode]}</h1>{!configured ? <p className="auth-notice">{labels.notConfigured}</p> : invalidReset ? <p className="auth-notice">{labels.invalidReset}</p> : showForm ? <><form onSubmit={submit}>{mode === 'sign-up' && <label>{labels.name}<input autoComplete="name" name="name" required /></label>}{mode !== 'reset-password' && <label>{labels.email}<input autoComplete="email" name="email" required type="email" /></label>}{mode !== 'forgot-password' && <label>{mode === 'reset-password' ? labels.newPassword : labels.password}<input autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={8} name="password" required type="password" /></label>}<button disabled={pending} type="submit">{labels.submit[mode]}</button></form>{standard && <><div className="auth-divider"><span>OR</span></div><button className="auth-google" disabled={pending} onClick={google} type="button">{labels.google}</button></>}</> : null}{status && <p aria-live="polite" className="auth-status">{status}</p>}{mode === 'sign-in' && <p className="auth-switch"><Link href={`/${locale}/auth/forgot-password`}>{labels.forgotLink}</Link></p>}{standard ? <p className="auth-switch">{labels.switchText[mode]} <Link href={authSwitchHref}>{labels.switchLink[mode]}</Link></p> : <p className="auth-switch"><Link href={`/${locale}/auth/sign-in`}>{labels.backToSignIn}</Link></p>}</section></main>
}
