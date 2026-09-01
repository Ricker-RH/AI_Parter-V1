'use client'

import {AccountSchema, UpdateCurrentAccountSchema, type Account, type UpdateCurrentAccount} from '@aifans/contracts'
import Link from 'next/link'
import {useEffect, useState} from 'react'
import type {Locale} from '../../i18n/config'
import styles from './MyProfilePanel.module.css'

export type MyProfileLabels = {
  loading: string; authRequired: string; signIn: string; unavailable: string; retry: string; emptyBio: string
  edit: string; save: string; saving: string; cancel: string; displayName: string; username: string; bio: string; locale: string
  languageEnglish: string; languageChinese: string; saved: string; saveError: string; invalidName: string; invalidUsername: string
}

type State = {status: 'loading'} | {status: 'auth'} | {status: 'unavailable'} | {status: 'ready'; account: Account} | {status: 'editing'; account: Account}

function parseAccount(value: unknown): Account | null {
  const result = AccountSchema.strict().safeParse(value)
  return result.success && result.data.kind === 'human' ? result.data : null
}

export function MyProfilePanel({labels, locale}: {labels: MyProfileLabels; locale: Locale}) {
  const [state, setState] = useState<State>({status: 'loading'})
  const [draft, setDraft] = useState<UpdateCurrentAccount>({})
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<'name' | 'username' | null>(null)

  async function load() {
    setState({status: 'loading'}); setMessage(null)
    try {
      const response = await fetch('/api/me', {cache: 'no-store', credentials: 'include'})
      if (response.status === 401) { setState({status: 'auth'}); return }
      if (!response.ok) { setState({status: 'unavailable'}); return }
      const account = parseAccount(await response.json())
      setState(account ? {status: 'ready', account} : {status: 'unavailable'})
    } catch { setState({status: 'unavailable'}) }
  }

  useEffect(() => { void load() }, [])

  if (state.status === 'loading') return <section className={styles.state} role="status">{labels.loading}</section>
  if (state.status === 'auth') return <section className={styles.state} role="alert"><p>{labels.authRequired}</p><Link href={`/${locale}/auth/sign-in`}>{labels.signIn}</Link></section>
  if (state.status === 'unavailable') return <section className={styles.state} role="alert"><p>{labels.unavailable}</p><button onClick={() => void load()} type="button">{labels.retry}</button></section>

  const account = state.account
  const editing = state.status === 'editing'
  const value = (key: keyof UpdateCurrentAccount) => draft[key] === undefined ? key === 'bio' ? account.bio ?? '' : account[key === 'displayName' ? 'displayName' : key === 'preferredLocale' ? 'preferredLocale' : 'username'] : draft[key]
  function beginEdit() {
    setDraft({username: account.username, displayName: account.displayName, bio: account.bio ?? null, preferredLocale: account.preferredLocale})
    setFieldError(null); setMessage(null); setState({status: 'editing', account})
  }
  function cancel() { setFieldError(null); setMessage(null); setState({status: 'ready', account}) }
  async function save() {
    const parsed = UpdateCurrentAccountSchema.safeParse(draft)
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path[0])
      setFieldError(paths.includes('username') ? 'username' : paths.includes('displayName') ? 'name' : null)
      setMessage(labels.saveError); return
    }
    setPending(true); setMessage(null); setFieldError(null)
    try {
      const response = await fetch('/api/me', {method: 'PATCH', credentials: 'include', headers: {'content-type': 'application/json'}, body: JSON.stringify(parsed.data)})
      if (response.status === 401) { setState({status: 'auth'}); return }
      if (!response.ok) { setMessage(labels.saveError); return }
      const next = parseAccount(await response.json())
      if (!next) { setMessage(labels.saveError); return }
      setState({status: 'ready', account: next}); setDraft({}); setMessage(labels.saved)
    } catch { setMessage(labels.saveError) } finally { setPending(false) }
  }

  return <section className={styles.profile} aria-labelledby="my-profile-title">
    <header className={styles.header}><div className={styles.avatar} aria-hidden="true">{account.displayName.slice(0, 1).toUpperCase()}</div><div><h2 id="my-profile-title">{account.displayName}</h2><p>@{account.username}</p></div>{!editing ? <button onClick={beginEdit} type="button">{labels.edit}</button> : null}</header>
    {!editing ? <div className={styles.details}><p>{account.bio || <span className={styles.empty}>{labels.emptyBio}</span>}</p><dl><div><dt>{labels.locale}</dt><dd>{account.preferredLocale === 'zh-CN' ? labels.languageChinese : labels.languageEnglish}</dd></div></dl></div> : <form className={styles.form} onSubmit={(event) => {event.preventDefault(); if (!pending) void save()}}>
      <label>{labels.displayName}<input aria-label={labels.displayName} maxLength={80} onChange={(event) => setDraft({...draft, displayName: event.target.value})} value={String(value('displayName'))}/></label>
      {fieldError === 'name' ? <p role="alert">{labels.invalidName}</p> : null}
      <label>{labels.username}<input aria-label={labels.username} maxLength={30} onChange={(event) => setDraft({...draft, username: event.target.value})} value={String(value('username'))}/></label>
      {fieldError === 'username' ? <p role="alert">{labels.invalidUsername}</p> : null}
      <label>{labels.bio}<textarea aria-label={labels.bio} maxLength={500} onChange={(event) => setDraft({...draft, bio: event.target.value || null})} value={String(value('bio'))}/></label>
      <label>{labels.locale}<select aria-label={labels.locale} onChange={(event) => setDraft({...draft, preferredLocale: event.target.value as Locale})} value={String(value('preferredLocale'))}><option value="en">{labels.languageEnglish}</option><option value="zh-CN">{labels.languageChinese}</option></select></label>
      <div className={styles.actions}><button disabled={pending} type="submit">{pending ? labels.saving : labels.save}</button><button disabled={pending} onClick={cancel} type="button">{labels.cancel}</button></div>
      {message ? <p role="status">{message}</p> : null}
    </form>}
    {!editing && message ? <p className={styles.message} role="status">{message}</p> : null}
  </section>
}
