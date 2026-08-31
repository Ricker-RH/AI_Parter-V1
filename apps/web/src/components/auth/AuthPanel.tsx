'use client'

import Link from 'next/link'
import {useState, type FormEvent} from 'react'
import type {Locale} from '../../i18n/config'

export type AuthActions = {
  getSession(): Promise<{user: unknown} | null>
  signInEmail(email: string, password: string): Promise<string | null>
  signUpEmail(name: string, email: string, password: string): Promise<string | null>
  signInGoogle(): Promise<string | null>
  signOut(): Promise<string | null>
}

type Labels = {
  title: Record<'sign-in' | 'sign-up', string>
  email: string
  password: string
  name: string
  submit: Record<'sign-in' | 'sign-up', string>
  google: string
  switchText: Record<'sign-in' | 'sign-up', string>
  switchLink: Record<'sign-in' | 'sign-up', string>
  notConfigured: string
  error: string
  success: Record<'sign-in' | 'sign-up', string>
}

const translations: Record<Locale, Labels> = {
  en: {
    title: {'sign-in': 'Sign in to AIFANS', 'sign-up': 'Create your AIFANS account'},
    email: 'Email', password: 'Password', name: 'Display name',
    submit: {'sign-in': 'Sign in', 'sign-up': 'Create account'},
    google: 'Continue with Google',
    switchText: {'sign-in': 'New to AIFANS?', 'sign-up': 'Already have an account?'},
    switchLink: {'sign-in': 'Create account', 'sign-up': 'Sign in'},
    notConfigured: 'Authentication is not configured yet.',
    error: 'Authentication could not be completed. Please try again.',
    success: {'sign-in': 'Signed in. Returning to AIFANS…', 'sign-up': 'Account created. Returning to AIFANS…'},
  },
  'zh-CN': {
    title: {'sign-in': '登录 AIFANS', 'sign-up': '创建 AIFANS 账户'},
    email: '邮箱', password: '密码', name: '昵称',
    submit: {'sign-in': '登录', 'sign-up': '创建账户'},
    google: '使用 Google 继续',
    switchText: {'sign-in': '第一次使用 AIFANS？', 'sign-up': '已经有账户？'},
    switchLink: {'sign-in': '创建账户', 'sign-up': '登录'},
    notConfigured: '登录服务尚未配置',
    error: '暂时无法完成身份验证，请重试。',
    success: {'sign-in': '登录成功，正在返回 AIFANS…', 'sign-up': '账户已创建，正在返回 AIFANS…'},
  },
}

export async function createBrowserAuthActions(locale: Locale): Promise<AuthActions> {
  const {createAuthClient} = await import('@neondatabase/auth/next')
  const client = createAuthClient()
  const finish = (error: unknown) => {
    if (!error) window.location.assign(`/${locale}`)
    return error && typeof error === 'object' && 'message' in error ? String(error.message) : error ? 'error' : null
  }
  return {
    async getSession() { const {data} = await client.getSession(); return data ?? null },
    async signInEmail(email, password) { const {error} = await client.signIn.email({email, password}); return finish(error) },
    async signUpEmail(name, email, password) { const {error} = await client.signUp.email({name, email, password}); return finish(error) },
    async signInGoogle() { const {error} = await client.signIn.social({provider: 'google', callbackURL: `/${locale}`}); return error ? finish(error) : null },
    async signOut() { const {error} = await client.signOut(); return finish(error) },
  }
}

export function AuthPanel({configured, locale, mode, actions}: {configured: boolean; locale: Locale; mode: 'sign-in' | 'sign-up'; actions?: AuthActions}) {
  const labels = translations[locale]
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function client(): Promise<AuthActions> { return actions ?? createBrowserAuthActions(locale) }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!configured || pending) return
    setPending(true); setStatus(null)
    try {
      const data = new FormData(event.currentTarget)
      const api = await client()
      const error = mode === 'sign-in'
        ? await api.signInEmail(String(data.get('email')), String(data.get('password')))
        : await api.signUpEmail(String(data.get('name')), String(data.get('email')), String(data.get('password')))
      setStatus(error ? labels.error : labels.success[mode])
    } catch {
      setStatus(labels.error)
    } finally {
      setPending(false)
    }
  }

  async function google() {
    if (!configured || pending) return
    setPending(true); setStatus(null)
    try {
      const error = await (await client()).signInGoogle()
      setStatus(error ? labels.error : labels.success['sign-in'])
    } catch {
      setStatus(labels.error)
    } finally {
      setPending(false)
    }
  }

  const alternate = mode === 'sign-in' ? 'sign-up' : 'sign-in'
  return <main className="auth-page"><section className="auth-card"><p className="auth-eyebrow">AIFANS / AUTH</p><h1>{labels.title[mode]}</h1>{!configured ? <p className="auth-notice">{labels.notConfigured}</p> : <><form onSubmit={submit}>{mode === 'sign-up' && <label>{labels.name}<input autoComplete="name" name="name" required /></label>}<label>{labels.email}<input autoComplete="email" name="email" required type="email" /></label><label>{labels.password}<input autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={8} name="password" required type="password" /></label><button disabled={pending} type="submit">{labels.submit[mode]}</button></form><div className="auth-divider"><span>OR</span></div><button className="auth-google" disabled={pending} onClick={google} type="button">{labels.google}</button></>}{status && <p aria-live="polite" className="auth-status">{status}</p>}<p className="auth-switch">{labels.switchText[mode]} <Link href={`/${locale}/auth/${alternate}`}>{labels.switchLink[mode]}</Link></p></section></main>
}
