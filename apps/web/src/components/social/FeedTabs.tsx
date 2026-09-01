'use client'

import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import {trackFeedTabSelected} from '../../lib/analytics/events'
import {useAnalytics} from '../../lib/analytics/provider'

type Labels = {forYou: string; following: string; home: string}

function feedHref(locale: Locale, currentQuery: string, following: boolean) {
  const query = new URLSearchParams(currentQuery)
  query.delete('cursor')
  query.delete('visualType')
  query.delete('feed')
  if (following) query.set('feed', 'following')
  return `/${locale}${query.size ? `?${query}` : ''}`
}

export function FeedTabs({following, labels, locale, currentQuery = ''}: {following: boolean; labels: Labels; locale: Locale; currentQuery?: string}) {
  const analytics = useAnalytics()
  const tabs = [
    {following: false, label: labels.forYou},
    {following: true, label: labels.following},
  ]

  return <nav aria-label={labels.home} className="tabs mobile-feed-tabs">
    {tabs.map((tab) => <Link
      aria-current={following === tab.following ? 'page' : undefined}
      className="tab"
      href={feedHref(locale, currentQuery, tab.following)}
      key={tab.label}
      onClick={() => trackFeedTabSelected(analytics, {feed: tab.following ? 'following' : 'for_you', locale})}
    >{tab.label}</Link>)}
  </nav>
}
