'use client'

import Link from 'next/link'
import {useEffect, useState} from 'react'
import type {Locale} from '../../i18n/config'
import {trackFeedTabSelected} from '../../lib/analytics/events'
import {useAnalytics} from '../../lib/analytics/provider'

type HomeVisualType = 'all' | 'realistic' | 'anime'
type Labels = {forYou: string; following: string; home: string; allTypes: string; realistic: string; anime: string}
function feedHref(locale: Locale, currentQuery: string, following: boolean, visualType: HomeVisualType) { const query = new URLSearchParams(currentQuery); query.delete('cursor'); query.delete('visualType'); if (following) query.set('feed', 'following'); else query.delete('feed'); if (visualType !== 'all') query.set('visualType', visualType); return `/${locale}${query.size ? `?${query}` : ''}` }

export function FeedTabs({following, labels, locale, currentQuery = '', visualType='all'}: {following: boolean; labels: Labels; locale: Locale; currentQuery?: string; visualType?: HomeVisualType}) {
  const analytics = useAnalytics(); const [selection, setSelection] = useState({forYou: following ? 'all' as HomeVisualType : visualType, following: following ? visualType : 'all' as HomeVisualType}); const [open, setOpen] = useState<'forYou' | 'following' | null>(null)
  useEffect(() => { setSelection((current) => following ? {...current, following: visualType} : {...current, forYou: visualType}) }, [following, visualType])
  const label = (value: HomeVisualType) => value === 'all' ? labels.allTypes : labels[value]
  const selector = (key: 'forYou' | 'following') => { const active = key === 'following'; const value = selection[key]; return <div className="mobile-feed-selector" key={key}><button aria-expanded={open === key} aria-haspopup="menu" aria-selected={following === active} className="tab" onClick={() => setOpen(open === key ? null : key)} role="tab" type="button">{active ? labels.following : labels.forYou} · {label(value)}</button>{open === key ? <div className="mobile-feed-menu" role="menu">{(['all', 'realistic', 'anime'] as const).map((type) => <Link href={feedHref(locale, currentQuery, active, type)} key={type} onClick={() => { setSelection((current) => ({...current, [key]: type})); setOpen(null); trackFeedTabSelected(analytics, {feed: active ? 'following' : 'for_you', locale}) }} role="menuitem">{label(type)}</Link>)}</div> : null}</div> }
  return <div aria-label={labels.home} className="tabs mobile-feed-tabs" role="tablist">{selector('forYou')}{selector('following')}</div>
}
