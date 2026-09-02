import {FeedPageSchema, type FeedKind, type FeedPage} from '@aifans/contracts'
import {cacheLife, cacheTag} from 'next/cache'
import type {Locale} from '../i18n/config'
import {fetchAifansApi} from './server-api'

export function publicFeedTag(locale: Locale, kind: Extract<FeedKind, 'for_you'>): string {
  return `feed:${kind}:${locale}`
}

export async function fetchCachedPublicFeed({kind, locale, cursor}: {kind: Extract<FeedKind, 'for_you'>; locale: Locale; cursor?: string}): Promise<FeedPage> {
  'use cache'
  cacheLife({stale: 30, revalidate: 60, expire: 3600})
  cacheTag(publicFeedTag(locale, kind))
  const query = new URLSearchParams({kind, locale})
  if (cursor) query.set('cursor', cursor)
  const response = await fetchAifansApi(`/v1/feed?${query}`, {policy: 'public-cache'})
  if (!response.ok) throw new Error('Public feed unavailable')
  return FeedPageSchema.parse(await response.json() as unknown)
}
