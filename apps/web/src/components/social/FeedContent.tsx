import type {FeedKind, FeedPage, FeedVisualType} from '@aifans/contracts'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import Link from 'next/link'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'

const visualTypes = ['all', 'realistic', 'anime', 'hybrid'] as const

function visualTypeHref(locale: Locale, feedKind: FeedKind, visualType: FeedVisualType) {
  const query = new URLSearchParams()
  if (feedKind === 'following') query.set('feed', 'following')
  if (visualType !== 'all') query.set('visualType', visualType)
  return `/${locale}${query.size ? `?${query}` : ''}`
}

export function FeedContent({result, locale, labels, empty = 'home', moreHref, feedKind, visualType}: {result: SocialApiResult<FeedPage>; locale: Locale; labels: SocialLabels; empty?: 'home' | 'bookmarks'; moreHref?: string | undefined; feedKind?: FeedKind; visualType?: FeedVisualType}) {
  const filters = feedKind && visualType ? <nav aria-label={labels.visualTypeFilter} className="visual-filter"><div className="tabs" role="tablist">{visualTypes.map((type) => <Link aria-selected={type === visualType} className="tab" href={visualTypeHref(locale, feedKind, type)} key={type} role="tab">{type === 'all' ? labels.allTypes : labels[type]}</Link>)}</div></nav> : null
  if (result.status !== 'ok') return <>{filters}<ResultState labels={labels} result={result} /></>
  if (result.data.items.length === 0) return <>{filters}<ResultState empty={empty} labels={labels} result={{status: 'not-found'}} /></>
  return <>{filters}<div className="feed-list">{result.data.items.map((post) => <PostCard key={post.id} labels={labels} locale={locale} post={post} />)}{result.data.nextCursor && moreHref ? <Link className="load-more" href={moreHref}>{labels.loadMore}</Link> : null}</div></>
}
