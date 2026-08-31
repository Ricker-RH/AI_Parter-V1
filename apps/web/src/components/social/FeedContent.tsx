import type {FeedPage} from '@aifans/contracts'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import Link from 'next/link'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'

export function FeedContent({result, locale, labels, empty = 'home', moreHref}: {result: SocialApiResult<FeedPage>; locale: Locale; labels: SocialLabels; empty?: 'home' | 'bookmarks'; moreHref?: string | undefined}) {
  if (result.status !== 'ok') return <ResultState labels={labels} result={result} />
  if (result.data.items.length === 0) return <ResultState empty={empty} labels={labels} result={{status: 'not-found'}} />
  return <div className="feed-list">{result.data.items.map((post) => <PostCard key={post.id} labels={labels} locale={locale} post={post} />)}{result.data.nextCursor && moreHref ? <Link className="load-more" href={moreHref}>{labels.loadMore}</Link> : null}</div>
}
