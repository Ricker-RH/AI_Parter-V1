'use client'

import Link from 'next/link'
import {useEffect, useRef, useState} from 'react'
import type {Locale} from '../i18n/config'
import {createBrowserAuthActions} from './auth/AuthPanel'

export interface MoreMenuLabels { more: string; appearance?: string; settings?: string; contact?: string; signOut?: string; contactUnavailable?: string }

export function GlobalMoreMenu({authenticated, contactHref, labels, locale, onSignOut}: {authenticated?: boolean; contactHref?: string; labels: MoreMenuLabels; locale: Locale; onSignOut?: () => void}) {
  const [open, setOpen] = useState(false); const trigger = useRef<HTMLButtonElement>(null); const menu = useRef<HTMLDivElement>(null)
  const [sessionState, setSessionState] = useState<boolean | undefined>(authenticated)
  useEffect(() => { if (authenticated !== undefined) { setSessionState(authenticated); return }; let live = true; void createBrowserAuthActions(locale).then((actions) => actions.getSession()).then((session) => { if (live) setSessionState(Boolean(session?.user)) }).catch(() => { if (live) setSessionState(false) }); return () => { live = false } }, [authenticated, locale])
  function close() { setOpen(false); trigger.current?.focus() }
  useEffect(() => { if (!open) return; function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') close() }; function onPointerDown(event: MouseEvent) { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close() }; document.addEventListener('keydown', onKeyDown); document.addEventListener('mousedown', onPointerDown); return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onPointerDown) } }, [open])
  async function signOut() { try { if (onSignOut) onSignOut(); else { const error = await (await createBrowserAuthActions(locale)).signOut(); if (error) return }; setSessionState(false); close() } catch { /* Preserve state when logout was not confirmed. */ } }
  const appearance = labels.appearance ?? 'Appearance', settings = labels.settings ?? 'Settings', contact = labels.contact ?? 'Contact Us', signOutLabel = labels.signOut ?? 'Sign Out', unavailable = labels.contactUnavailable ?? 'Contact is unavailable'
  return <div className="global-more"><button aria-controls="global-more-menu" aria-expanded={open} className="more-trigger" onClick={() => setOpen((value) => !value)} ref={trigger} type="button">{labels.more}</button>{open ? <div aria-label={labels.more} className="global-more-menu" id="global-more-menu" ref={menu} role="menu"><Link href={`/${locale}/settings#appearance`} onClick={close} role="menuitem">{appearance}</Link><Link href={`/${locale}/settings`} onClick={close} role="menuitem">{settings}</Link>{contactHref ? <a href={contactHref} role="menuitem">{contact}</a> : <><button disabled role="menuitem" type="button">{contact}</button><span role="status">{unavailable}</span></>}{sessionState ? <button onClick={() => void signOut()} role="menuitem" type="button">{signOutLabel}</button> : null}</div> : null}</div>
}
