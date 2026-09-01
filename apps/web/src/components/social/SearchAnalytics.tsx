'use client'

import {useEffect} from 'react'
import type {Locale} from '../../i18n/config'
import {trackSearchPerformed} from '../../lib/analytics/events'
import {useAnalytics} from '../../lib/analytics/provider'

export function SearchAnalytics({locale, category, queryLength}: {locale: Locale; category: 'all' | 'ips' | 'posts'; queryLength: number}) {
  const analytics = useAnalytics()
  useEffect(() => {
    trackSearchPerformed(analytics, {locale, category, queryLength})
  }, [analytics, category, locale, queryLength])
  return null
}
