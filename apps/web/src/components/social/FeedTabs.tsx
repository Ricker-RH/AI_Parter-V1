'use client'

import Link from 'next/link'
import {useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent} from 'react'
import type {Locale} from '../../i18n/config'
import {trackFeedTabSelected} from '../../lib/analytics/events'
import {useAnalytics} from '../../lib/analytics/provider'

type HomeVisualType = 'all' | 'realistic' | 'anime'
type Labels = {forYou: string; following: string; home: string; allTypes: string; realistic: string; anime: string}
function feedHref(locale: Locale, currentQuery: string, following: boolean, visualType: HomeVisualType) { const query = new URLSearchParams(currentQuery); query.delete('cursor'); query.delete('visualType'); if (following) query.set('feed', 'following'); else query.delete('feed'); if (visualType !== 'all') query.set('visualType', visualType); return `/${locale}${query.size ? `?${query}` : ''}` }

export function FeedTabs({following, labels, locale, currentQuery = '', visualType='all'}: {following: boolean; labels: Labels; locale: Locale; currentQuery?: string; visualType?: HomeVisualType}) {
  const analytics = useAnalytics(); const [selection, setSelection] = useState({forYou: following ? 'all' as HomeVisualType : visualType, following: following ? visualType : 'all' as HomeVisualType}); const [open, setOpen] = useState<'forYou' | 'following' | null>(null); const [focusEdge, setFocusEdge] = useState<'first' | 'last' | null>(null)
  const forYouId = useId(), followingId = useId(); const root = useRef<HTMLElement>(null); const triggers = {forYou: useRef<HTMLButtonElement>(null), following: useRef<HTMLButtonElement>(null)}
  useEffect(() => { setSelection((current) => following ? {...current, following: visualType} : {...current, forYou: visualType}) }, [following, visualType])
  useEffect(() => { if (!open || !focusEdge) return; const items = [...(root.current?.querySelectorAll<HTMLElement>(`#${open === 'forYou' ? forYouId : followingId} [role="menuitem"]`) ?? [])]; (focusEdge === 'last' ? items.at(-1) : items[0])?.focus(); setFocusEdge(null) }, [focusEdge, followingId, forYouId, open])
  useEffect(() => { if (!open) return; function outside(event: MouseEvent) { if (!root.current?.contains(event.target as Node)) setOpen(null) }; document.addEventListener('mousedown', outside); return () => document.removeEventListener('mousedown', outside) }, [open])
  const label = (value: HomeVisualType) => value === 'all' ? labels.allTypes : labels[value]
  function openMenu(key: 'forYou' | 'following', edge: 'first' | 'last' = 'first') { setFocusEdge(edge); setOpen(key) }
  function close(key: 'forYou' | 'following') { setOpen(null); triggers[key].current?.focus() }
  function navigate(event: ReactKeyboardEvent<HTMLDivElement>, key: 'forYou' | 'following') { const items = [...(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'))]; const index = items.indexOf(document.activeElement as HTMLElement); const target = event.key === 'Home' ? items[0] : event.key === 'End' ? items.at(-1) : event.key === 'ArrowDown' ? items[(index + 1 + items.length) % items.length] : event.key === 'ArrowUp' ? items[(index - 1 + items.length) % items.length] : null; if (event.key === 'Escape') { event.preventDefault(); close(key) } else if (target) { event.preventDefault(); target.focus() } }
  const selector = (key: 'forYou' | 'following') => { const active = key === 'following'; const value = selection[key]; const id = active ? followingId : forYouId; return <div className="mobile-feed-selector" key={key}><button aria-controls={id} aria-expanded={open === key} aria-haspopup="menu" aria-pressed={following === active} className="tab" onClick={() => open === key ? close(key) : openMenu(key)} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openMenu(key, event.key === 'ArrowUp' ? 'last' : 'first') } }} ref={triggers[key]} type="button">{active ? labels.following : labels.forYou} · {label(value)}</button>{open === key ? <div className="mobile-feed-menu" id={id} onKeyDown={(event) => navigate(event, key)} role="menu">{(['all', 'realistic', 'anime'] as const).map((type) => <Link href={feedHref(locale, currentQuery, active, type)} key={type} onClick={() => { setSelection((current) => ({...current, [key]: type})); setOpen(null); trackFeedTabSelected(analytics, {feed: active ? 'following' : 'for_you', locale}) }} role="menuitem">{label(type)}</Link>)}</div> : null}</div> }
  return <nav aria-label={labels.home} className="tabs mobile-feed-tabs" ref={root}>{selector('forYou')}{selector('following')}</nav>
}
