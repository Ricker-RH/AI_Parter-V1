'use client'

import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import {trackFeedTabSelected} from '../../lib/analytics/events'
import {useAnalytics} from '../../lib/analytics/provider'

export function FeedTabs({following, labels, locale}: {following: boolean; labels: {forYou: string; following: string; home: string}; locale: Locale}) {
  const analytics = useAnalytics()
  return <div aria-label={labels.home} className="tabs" role="tablist"><Link aria-selected={!following} className="tab" href={`/${locale}`} onClick={() => trackFeedTabSelected(analytics, {feed: 'for_you', locale})} role="tab">{labels.forYou}</Link><Link aria-selected={following} className="tab" href={`/${locale}?feed=following`} onClick={() => trackFeedTabSelected(analytics, {feed: 'following', locale})} role="tab">{labels.following}</Link></div>
}
