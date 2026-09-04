'use client'

import {AccountSchema, UpdateCurrentAccountSchema, type Account, type UpdateCurrentAccount} from '@aifans/contracts'
import Link from 'next/link'
import {useEffect, useRef, useState} from 'react'
import type {Locale} from '../../i18n/config'
import styles from './MyProfilePanel.module.css'
import {ProfilePageHeader} from './ProfilePageHeader'
import {MyProfileTabs} from './MyProfileTabs'
import type {SocialLabels} from '../social/types'

export type MyProfileLabels = {
  loading: string; authRequired: string; signIn: string; unavailable: string; retry: string; emptyBio: string
  edit: string; save: string; saving: string; cancel: string; displayName: string; username: string; bio: string; locale: string
  languageEnglish: string; languageChinese: string; saved: string; saveError: string; invalidName: string; invalidUsername: string
  back:string;search:string;more:string;tabs:string;myIps:string;liked:string;savedTab:string;following:string;loadingSection:string;unavailableSection:string;retrySection:string;myIpsEmpty:string;likedEmpty:string;savedEmpty:string;followingEmpty:string;close?: string
}

type State = {status: 'loading'} | {status: 'auth'} | {status: 'unavailable'} | {status: 'ready'; account: Account} | {status: 'editing'; account: Account}

function parseAccount(value: unknown): Account | null {
  const result = AccountSchema.strict().safeParse(value)
  return result.success && result.data.kind === 'human' ? result.data : null
}

export function MyProfilePanel({labels, locale, socialLabels, viewerScope}: {labels: MyProfileLabels; locale: Locale; socialLabels?: SocialLabels; viewerScope?: string}) {
  const [state, setState] = useState<State>({status: 'loading'})
  const [draft, setDraft] = useState<Partial<UpdateCurrentAccount>>({})
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<'name' | 'username' | null>(null)
  const editTrigger = useRef<HTMLButtonElement>(null)
  const editDialog = useRef<HTMLDivElement>(null)
  const firstEditField = useRef<HTMLInputElement>(null)
  const dismissingEdit = useRef(false)
  const lifecycle = useRef<{mounted: boolean; generation: number; controller: AbortController | null}>({mounted: false, generation: 0, controller: null})

  function startRequest() {
    const current = lifecycle.current
    current.generation += 1
    current.controller?.abort()
    const controller = new AbortController()
    current.controller = controller
    return {controller, generation: current.generation}
  }

  function isCurrentRequest(request: {controller: AbortController; generation: number}) {
    const current = lifecycle.current
    return current.mounted && current.generation === request.generation && current.controller === request.controller && !request.controller.signal.aborted
  }

  function finishRequest(request: {controller: AbortController; generation: number}) {
    if (isCurrentRequest(request)) lifecycle.current.controller = null
  }

  function invalidateRequest() {
    const current = lifecycle.current
    current.generation += 1
    current.controller?.abort()
    current.controller = null
  }

  async function load() {
    const request = startRequest()
    if (!isCurrentRequest(request)) return
    setState({status: 'loading'}); setMessage(null)
    try {
      const response = await fetch('/api/me', {cache: 'no-store', credentials: 'include', signal: request.controller.signal})
      if (!isCurrentRequest(request)) return
      if (response.status === 401) { setState({status: 'auth'}); return }
      if (!response.ok) { setState({status: 'unavailable'}); return }
      const account = parseAccount(await response.json())
      if (!isCurrentRequest(request)) return
      setState(account ? {status: 'ready', account} : {status: 'unavailable'})
    } catch { if (isCurrentRequest(request)) setState({status: 'unavailable'}) }
    finally { finishRequest(request) }
  }

  useEffect(() => {
    lifecycle.current.mounted = true
    void load()
    return () => {
      lifecycle.current.mounted = false
      invalidateRequest()
    }
  }, [])

  function closeEditor() {
    if (state.status !== 'editing') return
    dismissingEdit.current = true
    invalidateRequest(); setPending(false); setFieldError(null); setMessage(null); setDraft({}); setState({status: 'ready', account: state.account})
    editTrigger.current?.focus()
  }

  useEffect(() => {
    if (state.status !== 'editing') return
    firstEditField.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); closeEditor(); return }
      if (event.key !== 'Tab') return
      const items = [...(editDialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? [])]
      if (!items.length) return
      const first = items[0]
      const last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    function onFocusIn(event: FocusEvent) {
      if (!dismissingEdit.current && !editDialog.current?.contains(event.target as Node)) firstEditField.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('focusin', onFocusIn) }
  }, [state.status])

  if (state.status === 'loading') return <section className={styles.state} role="status">{labels.loading}</section>
  if (state.status === 'auth') return <section className={styles.state} role="alert"><p>{labels.authRequired}</p><Link href={`/${locale}/auth/sign-in`}>{labels.signIn}</Link></section>
  if (state.status === 'unavailable') return <section className={styles.state} role="alert"><p>{labels.unavailable}</p><button onClick={() => void load()} type="button">{labels.retry}</button></section>

  const account = state.account
  const editing = state.status === 'editing'
  const value = (key: keyof UpdateCurrentAccount) => draft[key] === undefined ? key === 'bio' ? account.bio ?? '' : account[key === 'displayName' ? 'displayName' : key === 'preferredLocale' ? 'preferredLocale' : 'username'] : draft[key]
  function beginEdit() {
    dismissingEdit.current = false
    setDraft({profileVersion: account.profileVersion, username: account.username, displayName: account.displayName, bio: account.bio ?? null, preferredLocale: account.preferredLocale})
    setFieldError(null); setMessage(null); setState({status: 'editing', account})
  }
  async function save() {
    const parsed = UpdateCurrentAccountSchema.safeParse(draft)
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path[0])
      setFieldError(paths.includes('username') ? 'username' : paths.includes('displayName') ? 'name' : null)
      setMessage(labels.saveError); return
    }
    const request = startRequest()
    if (!isCurrentRequest(request)) return
    setPending(true); setMessage(null); setFieldError(null)
    try {
      const response = await fetch('/api/me', {method: 'PATCH', credentials: 'include', headers: {'content-type': 'application/json'}, body: JSON.stringify(parsed.data), signal: request.controller.signal})
      if (!isCurrentRequest(request)) return
      if (response.status === 401) { setState({status: 'auth'}); return }
      if (!response.ok) { setMessage(labels.saveError); return }
      const next = parseAccount(await response.json())
      if (!isCurrentRequest(request)) return
      if (!next) { setMessage(labels.saveError); return }
      dismissingEdit.current = true
      setState({status: 'ready', account: next}); setDraft({}); setMessage(labels.saved); editTrigger.current?.focus()
    } catch { if (isCurrentRequest(request)) setMessage(labels.saveError) }
    finally { if (isCurrentRequest(request)) setPending(false); finishRequest(request) }
  }

  return <div className={styles.page}><div aria-hidden={editing || undefined} className={styles.pageContent}><ProfilePageHeader backHref={`/${locale}`} labels={labels} locale={locale} username={account.username}/><div className={styles.surface} data-profile-content-frame><section className={styles.profile} aria-labelledby="my-profile-title">
    <header className={styles.identityRow}><div className={styles.identityCopy}><h2 id="my-profile-title">{account.displayName}</h2><p>@{account.username}</p></div><div className={styles.avatar} aria-hidden="true">{account.displayName.slice(0, 1).toUpperCase()}</div></header>
    <div className={styles.details}><p className={styles.bio}>{account.bio || <span className={styles.empty}>{labels.emptyBio}</span>}</p></div><button className={styles.editAction} onClick={beginEdit} ref={editTrigger} type="button">{labels.edit}</button>
    {!editing && message ? <p className={styles.message} role="status">{message}</p> : null}
  </section><MyProfileTabs labels={{tabs:labels.tabs,myIps:labels.myIps,liked:labels.liked,saved:labels.savedTab,following:labels.following,loadingSection:labels.loadingSection,authRequired:labels.authRequired,signIn:labels.signIn,unavailableSection:labels.unavailableSection,retrySection:labels.retrySection,myIpsEmpty:labels.myIpsEmpty,likedEmpty:labels.likedEmpty,savedEmpty:labels.savedEmpty,followingEmpty:labels.followingEmpty}} locale={locale} socialLabels={socialLabels??({} as SocialLabels)} {...(viewerScope ? {viewerScope} : {})}/></div></div>
  {editing ? <div className={styles.editOverlay} data-my-profile-edit-backdrop onPointerDown={(event) => { if (event.target === event.currentTarget) closeEditor() }}><div aria-labelledby="my-profile-edit-title" aria-modal="true" className={styles.editDialog} onPointerDown={(event) => event.stopPropagation()} ref={editDialog} role="dialog">
    <header className={styles.editHeader}><h2 id="my-profile-edit-title">{labels.edit}</h2><button aria-label={labels.close ?? `${labels.cancel} ${labels.edit}`} className={styles.editClose} onClick={closeEditor} type="button">×</button></header>
    <form className={styles.form} onSubmit={(event) => {event.preventDefault(); if (!pending) void save()}}>
      <label>{labels.displayName}<input aria-label={labels.displayName} maxLength={80} onChange={(event) => setDraft({...draft, displayName: event.target.value})} ref={firstEditField} value={String(value('displayName'))}/></label>
      {fieldError === 'name' ? <p role="alert">{labels.invalidName}</p> : null}
      <label>{labels.username}<input aria-label={labels.username} maxLength={30} onChange={(event) => setDraft({...draft, username: event.target.value})} value={String(value('username'))}/></label>
      {fieldError === 'username' ? <p role="alert">{labels.invalidUsername}</p> : null}
      <label>{labels.bio}<textarea aria-label={labels.bio} maxLength={500} onChange={(event) => setDraft({...draft, bio: event.target.value || null})} value={String(value('bio'))}/></label>
      <label>{labels.locale}<select aria-label={labels.locale} onChange={(event) => setDraft({...draft, preferredLocale: event.target.value as Locale})} value={String(value('preferredLocale'))}><option value="en">{labels.languageEnglish}</option><option value="zh-CN">{labels.languageChinese}</option></select></label>
      <div className={styles.actions}><button disabled={pending} type="submit">{pending ? labels.saving : labels.save}</button><button disabled={pending} onClick={closeEditor} type="button">{labels.cancel}</button></div>
      {message ? <p role="status">{message}</p> : null}
    </form>
  </div></div> : null}</div>
}
