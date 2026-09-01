import type {FeedPage} from '@aifans/contracts'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import Link from 'next/link'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'

export function FeedContent({result, locale, labels, empty = 'home', moreHref, canMutate = false, returnTo}: {result: SocialApiResult<FeedPage>; locale: Locale; labels: SocialLabels; empty?: 'home' | 'bookmarks' | 'liked'; moreHref?: string | undefined; canMutate?: boolean; returnTo?: string}) {
  if (result.status !== 'ok') return <ResultState labels={labels} result={result} />
  if (result.data.items.length === 0) return <ResultState empty={empty} labels={labels} result={{status: 'not-found'}} />
  return <div className="feed-list">{result.data.items.map((post) => <PostCard canMutate={canMutate} key={post.id} labels={labels} locale={locale} post={post} {...(returnTo ? {returnTo} : {})} />)}{result.data.nextCursor && moreHref ? <Link className="load-more" href={moreHref}>{labels.loadMore}</Link> : null}</div>
}
