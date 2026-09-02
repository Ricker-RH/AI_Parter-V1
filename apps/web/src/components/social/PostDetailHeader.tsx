'use client'

import {useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent} from 'react'
import {useRouter} from 'next/navigation'
import Link from 'next/link'
import {Logo} from '@aifans/ui'
import type {Locale} from '../../i18n/config'

export type PostDetailHeaderLabels = {
  back: string
  copyLink: string
  copySuccess: string
  post: string
  postActions: string
  refresh: string
  share: string
  shareSuccess: string
}

function BackIcon() { return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg> }
function MoreIcon() { return <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg> }

export function hasSameOriginAppReferrer(referrer: string, origin: string, locale: Locale): boolean {
  if (!referrer) return false
  try {
    const target = new URL(referrer)
    return target.origin === origin && (target.pathname === `/${locale}` || target.pathname.startsWith(`/${locale}/`))
  } catch { return false }
}

export function PostDetailHeader({labels, locale, postId, referrer}: {labels: PostDetailHeaderLabels; locale: Locale; postId: string; referrer?: string}) {
  const router = useRouter(); const trigger = useRef<HTMLButtonElement>(null); const menu = useRef<HTMLDivElement>(null)
  const menuId = useId(); const [open, setOpen] = useState(false); const [status, setStatus] = useState(''); const focusEdge = useRef<'first'|'last'|null>(null)
  const canonicalUrl = () => new URL(`/${locale}/posts/${postId}`, window.location.origin).toString()
  const menuItems = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])]
  function close() { setOpen(false); trigger.current?.focus() }
  function openMenu(edge: 'first'|'last' = 'first') { focusEdge.current = edge; setOpen(true) }
  useEffect(() => { if (!open || !focusEdge.current) return; const items = menuItems(); const target = focusEdge.current === 'last' ? items.at(-1) : items[0]; focusEdge.current = null; target?.focus() }, [open])
  useEffect(() => { if (!open) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }; const onPointerDown = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close() }; document.addEventListener('keydown', onKeyDown); document.addEventListener('mousedown', onPointerDown); return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onPointerDown) } }, [open])
  function navigateMenu(event: ReactKeyboardEvent<HTMLDivElement>) { const items = menuItems(); const current = items.indexOf(document.activeElement as HTMLButtonElement); const destination = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1 + items.length) % items.length : event.key === 'ArrowUp' ? (current - 1 + items.length) % items.length : -1; if (destination >= 0) { event.preventDefault(); items[destination]?.focus() } }
  function back() { const currentReferrer = referrer ?? document.referrer; if (hasSameOriginAppReferrer(currentReferrer, window.location.origin, locale)) router.back(); else router.push(`/${locale}`) }
  async function copy() { try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(canonicalUrl()); setStatus(labels.copySuccess) } catch { setStatus('') } finally { close() } }
  async function share() { const url = canonicalUrl(); try { if (navigator.share) { await navigator.share({title: labels.post, url}); setStatus(labels.shareSuccess) } else await copy() } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') { close(); return }; await copy(); return } close() }
  return <header className="post-detail-header"><button aria-label={labels.back} className="post-detail-back" onClick={back} type="button"><BackIcon/></button><div className="post-detail-heading"><h1 className="post-detail-title">{labels.post}</h1></div><Link aria-label="AIFANS" className="post-detail-brand" href={`/${locale}`}><Logo showWordmark={false}/></Link><div className="post-detail-menu"><button aria-controls={menuId} aria-expanded={open} aria-haspopup="menu" aria-label={labels.postActions} className="post-detail-menu-trigger" onClick={() => open ? close() : openMenu()} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openMenu(event.key === 'ArrowUp' ? 'last' : 'first') } }} ref={trigger} type="button"><MoreIcon/></button>{open ? <div aria-label={labels.postActions} className="post-detail-menu-list" id={menuId} onKeyDown={navigateMenu} ref={menu} role="menu"><button onClick={() => { router.refresh(); close() }} role="menuitem" type="button">{labels.refresh}</button><button onClick={() => void copy()} role="menuitem" type="button">{labels.copyLink}</button><button onClick={() => void share()} role="menuitem" type="button">{labels.share}</button></div> : null}</div><span aria-live="polite" className="post-detail-status" role="status">{status}</span></header>
}
