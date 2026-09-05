'use client'

import {outsideDismiss} from '../../lib/ui/outside-dismiss'

import {HumanProfileSchema, type HumanProfile} from '@aifans/contracts'
import {useEffect, useRef, useState} from 'react'
import type {Locale} from '../../i18n/config'
import {humanProfileLabels} from './human-profile-labels'
import styles from './HumanProfileBlockMenu.module.css'

export function HumanProfileBlockMenu({locale, onProfileChange, profile}: {locale: Locale; onProfileChange: (profile: HumanProfile) => void; profile: HumanProfile}) {
  const labels = humanProfileLabels(locale)
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const menuRoot = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!open) return; return outsideDismiss(target => Boolean(menuRoot.current?.contains(target)), () => setOpen(false)) }, [open])
  if (profile.isOwner) return null
  const text = profile.relationship.blockedByViewer ? labels.unblock : labels.block
  async function changeBlock() {
    if (pending) return
    setPending(true); setError(false)
    const request = new AbortController(); controller.current = request
    try {
      const response = await fetch(`/api/humans/${profile.identity.id}/block`, {method: profile.relationship.blockedByViewer ? 'DELETE' : 'PUT', headers: {'content-type': 'application/json'}, body: '{}', credentials: 'same-origin', signal: request.signal})
      if (!response.ok) throw Error()
      const mutation = await response.json()
      if (!mutation || Object.keys(mutation).length !== 1 || typeof mutation.changed !== 'boolean') throw Error()
      const refreshed = await fetch(`/api/humans/${profile.identity.id}`, {cache: 'no-store', credentials: 'same-origin', signal: request.signal})
      if (!refreshed.ok) throw Error()
      const next = HumanProfileSchema.parse(await refreshed.json())
      if (next.identity.id !== profile.identity.id) throw Error()
      if (!request.signal.aborted) { onProfileChange(next); setOpen(false); setConfirm(false) }
    } catch { if (!request.signal.aborted) setError(true) } finally { if (!request.signal.aborted) setPending(false) }
  }
  return <div className={styles.menu} ref={menuRoot}>
    <button aria-expanded={open} aria-haspopup="menu" aria-label={locale === 'zh-CN' ? '更多' : 'More'} className={styles.trigger} onClick={() => { setOpen(value => !value); setConfirm(false) }} type="button">•••</button>
    {open ? <div className={styles.popover} role="menu">{confirm ? <div className={styles.confirm}><p>{labels.blockExplanation}</p><div><button disabled={pending} onClick={() => void changeBlock()} type="button">{labels.confirmBlock}</button><button disabled={pending} onClick={() => setConfirm(false)} type="button">{labels.cancel}</button></div></div> : <button onClick={() => profile.relationship.blockedByViewer ? void changeBlock() : setConfirm(true)} role="menuitem" type="button">{text}</button>}{error ? <p role="alert">{labels.error}</p> : null}</div> : null}
  </div>
}
