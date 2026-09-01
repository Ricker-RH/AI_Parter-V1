'use client'

import Link from 'next/link'
import {useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent} from 'react'
import type {Locale} from '../i18n/config'
import {createBrowserAuthActions} from './auth/AuthPanel'

export interface MoreMenuLabels { more: string; appearance?: string; settings?: string; contact?: string; signOut?: string; contactUnavailable?: string }

function MoreIcon() {
  return <svg aria-hidden="true" className="more-trigger-icon" fill="none" viewBox="0 0 24 24"><path d="M4 7h16M4 12h12M4 17h8" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>
}

export function GlobalMoreMenu({authenticated, contactHref, labels, locale, onSignOut}: {authenticated?: boolean; contactHref?: string; labels: MoreMenuLabels; locale: Locale; onSignOut?: () => void}) {
  const [open, setOpen] = useState(false); const trigger = useRef<HTMLButtonElement>(null); const menu = useRef<HTMLDivElement>(null); const menuId = useId(); const focusEdge = useRef<'first' | 'last' | null>(null)
  const [sessionState, setSessionState] = useState<boolean | undefined>(authenticated)
  useEffect(() => { if (authenticated !== undefined) { setSessionState(authenticated); return }; if (!open || sessionState !== undefined) return; let live = true; void createBrowserAuthActions(locale).then((actions) => actions.getSession()).then((session) => { if (live) setSessionState(Boolean(session?.user)) }).catch(() => { if (live) setSessionState(false) }); return () => { live = false } }, [authenticated, locale, open, sessionState])
  function close() { setOpen(false); trigger.current?.focus() }
  function menuItems() { return [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])] }
  function openMenu(edge: 'first' | 'last' = 'first') { focusEdge.current = edge; setOpen(true) }
  useEffect(() => { if (!open || !focusEdge.current) return; const items = menuItems(); const target = focusEdge.current === 'last' ? items.at(-1) : items[0]; focusEdge.current = null; target?.focus() }, [open, sessionState])
  useEffect(() => { if (!open) return; function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') close() }; function onPointerDown(event: MouseEvent) { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close() }; document.addEventListener('keydown', onKeyDown); document.addEventListener('mousedown', onPointerDown); return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onPointerDown) } }, [open])
  function navigateMenu(event: ReactKeyboardEvent<HTMLDivElement>) { const items = menuItems(); const current = items.indexOf(document.activeElement as HTMLElement); if (!items.length) return; const destination = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1 + items.length) % items.length : event.key === 'ArrowUp' ? (current - 1 + items.length) % items.length : -1; if (destination >= 0) { event.preventDefault(); items[destination]?.focus() } }
  async function signOut() { try { if (onSignOut) onSignOut(); else { const error = await (await createBrowserAuthActions(locale)).signOut(); if (error) return }; setSessionState(false); close() } catch { /* Preserve state when logout was not confirmed. */ } }
  const appearance = labels.appearance ?? 'Appearance', settings = labels.settings ?? 'Settings', contact = labels.contact ?? 'Contact Us', signOutLabel = labels.signOut ?? 'Sign Out', unavailable = labels.contactUnavailable ?? 'Contact is unavailable'
  return <div className="global-more"><button aria-controls={menuId} aria-expanded={open} aria-haspopup="menu" className="more-trigger" onClick={() => open ? close() : openMenu()} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openMenu(event.key === 'ArrowUp' ? 'last' : 'first') } }} ref={trigger} type="button"><MoreIcon/><span className="more-trigger-label">{labels.more}</span></button>{open ? <div aria-label={labels.more} className="global-more-menu" id={menuId} onKeyDown={navigateMenu} ref={menu} role="menu"><Link href={`/${locale}/settings#appearance`} onClick={close} role="menuitem">{appearance}</Link><Link href={`/${locale}/settings`} onClick={close} role="menuitem">{settings}</Link>{contactHref ? <a href={contactHref} role="menuitem">{contact}</a> : <><button disabled role="menuitem" type="button">{contact}</button><span role="status">{unavailable}</span></>}{sessionState ? <button onClick={() => void signOut()} role="menuitem" type="button">{signOutLabel}</button> : null}</div> : null}</div>
}
