'use client'

import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import {trackFeedTabSelected} from '../../lib/analytics/events'
import {useAnalytics} from '../../lib/analytics/provider'

function feedHref(locale: Locale, currentQuery: string, following: boolean) {
  const query = new URLSearchParams(currentQuery)
  query.delete('cursor')
  if (following) query.set('feed', 'following')
  else query.delete('feed')
  return `/${locale}${query.size ? `?${query}` : ''}`
}

export function FeedTabs({following, labels, locale, currentQuery = ''}: {following: boolean; labels: {forYou: string; following: string; home: string}; locale: Locale; currentQuery?: string}) {
  const analytics = useAnalytics()
  return <div aria-label={labels.home} className="tabs" role="tablist"><Link aria-selected={!following} className="tab" href={feedHref(locale, currentQuery, false)} onClick={() => trackFeedTabSelected(analytics, {feed: 'for_you', locale})} role="tab">{labels.forYou}</Link><Link aria-selected={following} className="tab" href={feedHref(locale, currentQuery, true)} onClick={() => trackFeedTabSelected(analytics, {feed: 'following', locale})} role="tab">{labels.following}</Link></div>
}
