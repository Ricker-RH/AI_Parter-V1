import type {FeedKind, FeedPage, FeedVisualType} from '@aifans/contracts'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import Link from 'next/link'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'

const visualTypes = ['all', 'realistic', 'anime'] as const

function visualTypeHref(locale: Locale, currentQuery: string, visualType: FeedVisualType) {
  const query = new URLSearchParams(currentQuery)
  query.delete('cursor')
  if (visualType === 'all') query.delete('visualType')
  else query.set('visualType', visualType)
  return `/${locale}${query.size ? `?${query}` : ''}`
}

export function FeedContent({result, locale, labels, empty = 'home', moreHref, feedKind, visualType, currentQuery = '', canMutate = false, returnTo}: {result: SocialApiResult<FeedPage>; locale: Locale; labels: SocialLabels; empty?: 'home' | 'bookmarks'; moreHref?: string | undefined; feedKind?: FeedKind; visualType?: FeedVisualType; currentQuery?: string; canMutate?: boolean; returnTo?: string}) {
  const selectedVisualType = visualType === 'hybrid' ? 'all' : visualType
  const filters = feedKind && selectedVisualType ? <nav aria-label={labels.visualTypeFilter} className="visual-filter"><div className="tabs" role="tablist">{visualTypes.map((type) => <Link aria-selected={type === selectedVisualType} className="tab" href={visualTypeHref(locale, currentQuery, type)} key={type} role="tab">{type === 'all' ? labels.allTypes : labels[type]}</Link>)}</div></nav> : null
  if (result.status !== 'ok') return <>{filters}<ResultState labels={labels} result={result} /></>
  if (result.data.items.length === 0) return <>{filters}<ResultState empty={empty} labels={labels} result={{status: 'not-found'}} /></>
  return <>{filters}<div className="feed-list">{result.data.items.map((post) => <PostCard canMutate={canMutate} key={post.id} labels={labels} locale={locale} post={post} {...(returnTo ? {returnTo} : {})} />)}{result.data.nextCursor && moreHref ? <Link className="load-more" href={moreHref}>{labels.loadMore}</Link> : null}</div></>
}
