'use client'

import Link from 'next/link'
import {useEffect, useState} from 'react'
import type {Locale} from '../../i18n/config'
import {createBrowserAuthActions, type AuthActions} from './AuthPanel'

function emailFrom(session: {user: unknown} | null): string | null {
  const user = session?.user
  if (!user || typeof user !== 'object' || !('email' in user)) return null
  return typeof user.email === 'string' ? user.email : null
}

export function AuthAccountControl({configured, locale, actions}: {configured: boolean; locale: Locale; actions?: AuthActions}) {
  const [state, setState] = useState<'loading' | 'anonymous' | 'authenticated'>('loading')
  const [email, setEmail] = useState<string | null>(null)
  const labels = locale === 'zh-CN'
    ? {title: '账户', description: '登录状态由 Neon Auth 安全管理。', signIn: '登录', signUp: '创建账户', signOut: '退出登录', unavailable: '登录服务尚未配置'}
    : {title: 'Account', description: 'Your session is securely managed by Neon Auth.', signIn: 'Sign in', signUp: 'Create account', signOut: 'Sign out', unavailable: 'Authentication is not configured yet.'}

  useEffect(() => {
    if (!configured) { setState('anonymous'); return }
    let active = true
    void (async () => {
      const session = await (actions ?? await createBrowserAuthActions(locale)).getSession().catch(() => null)
      if (!active) return
      const nextEmail = emailFrom(session)
      setEmail(nextEmail); setState(nextEmail ? 'authenticated' : 'anonymous')
    })()
    return () => { active = false }
  }, [actions, configured, locale])

  async function signOut() {
    try {
      const error = await (actions ?? await createBrowserAuthActions(locale)).signOut()
      if (!error) { setEmail(null); setState('anonymous') }
    } catch {
      // Keep the current account visible when the provider did not confirm sign-out.
    }
  }

  return <section className="settings-section"><h2>{labels.title}</h2><p>{configured ? labels.description : labels.unavailable}</p>{configured && state === 'authenticated' ? <div className="account-row"><span>{email}</span><button className="choice" onClick={signOut} type="button">{labels.signOut}</button></div> : configured && state === 'anonymous' ? <div className="choice-row"><Link className="choice" href={`/${locale}/auth/sign-in`}>{labels.signIn}</Link><Link className="choice" href={`/${locale}/auth/sign-up`}>{labels.signUp}</Link></div> : null}</section>
}
