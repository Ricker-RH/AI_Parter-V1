'use client'

import Link from 'next/link'
import {useEffect, useRef, useState} from 'react'
import type {Locale} from '../../i18n/config'
import {createBrowserAuthActions, type AuthActions} from './AuthPanel'

function emailFrom(session: {user: unknown} | null): string | null {
  const user = session?.user
  if (!user || typeof user !== 'object' || !('email' in user)) return null
  return typeof user.email === 'string' ? user.email : null
}

export function AuthAccountControl({configured, locale, actions, settings = false}: {settings?: boolean; configured: boolean; locale: Locale; actions?: AuthActions}) {
  const [state, setState] = useState<'loading' | 'anonymous' | 'authenticated'>('loading')
  const [email, setEmail] = useState<string | null>(null)
  const [pending,setPending]=useState(false),[failed,setFailed]=useState(false)
  const busy=useRef(false)
  const confirmation=useRef<HTMLDialogElement>(null)
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
    if(busy.current)return

    busy.current=true;setPending(true);setFailed(false)
    try {
      const error = await (actions ?? await createBrowserAuthActions(locale)).signOut()
      if (!error) { setEmail(null); setState('anonymous') }
      else setFailed(true)
    } catch {
      // Keep the current account visible when the provider did not confirm sign-out.
      setFailed(true)
    } finally {
      busy.current=false;setPending(false)
    }
  }

  return <section className="settings-section">{!settings?<h2>{labels.title}</h2>:null}{!settings?<p>{configured ? labels.description : labels.unavailable}</p>:null}{configured && state === 'authenticated' ? <div className="account-row">{settings?<span className="account-label">{labels.title}</span>:null}<span className="account-email">{email}</span><button aria-busy={pending} disabled={pending} className="choice" onClick={()=>settings?confirmation.current?.showModal():void signOut()} type="button">{labels.signOut}</button></div> : configured && state === 'anonymous' ? <div className="choice-row"><Link className="choice" href={`/${locale}/auth/sign-in`}>{labels.signIn}</Link><Link className="choice" href={`/${locale}/auth/sign-up`}>{labels.signUp}</Link></div> : null}{failed?<p role="alert">{locale==='zh-CN'?'退出登录未完成，账户仍保持登录状态，请重试。':'Sign out could not be completed. You are still signed in; please try again.'}</p>:null}{settings?<dialog ref={confirmation} className="settings-signout-dialog" onClick={event=>{event.stopPropagation();if(event.target===event.currentTarget)confirmation.current?.close()}}><div><h2>{locale==='zh-CN'?'退出登录？':'Sign out?'}</h2><p>{locale==='zh-CN'?'退出后，需要重新登录才能查看消息和管理个人资料。':'You will need to sign in again to access messages and your profile.'}</p><div className="choice-row"><button className="choice" type="button" onClick={()=>confirmation.current?.close()}>{locale==='zh-CN'?'取消':'Cancel'}</button><button className="choice" type="button" onClick={()=>{confirmation.current?.close();void signOut()}}>{labels.signOut}</button></div></div></dialog>:null}</section>
}
