import type {FeedPage} from '@aifans/contracts'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import Link from 'next/link'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'

export function FeedContent({result, locale, labels, empty = 'home', emptyActionHref, moreHref, canMutate = false, returnTo}: {result: SocialApiResult<FeedPage>; locale: Locale; labels: SocialLabels; empty?: 'home' | 'bookmarks' | 'liked'; emptyActionHref?: string; moreHref?: string | undefined; canMutate?: boolean; returnTo?: string}) {
  if (result.status !== 'ok') return <div className="social-surface-state" data-social-surface-fill><ResultState labels={labels} result={result} /></div>
  if (result.data.items.length === 0) return <div className="social-surface-state" data-social-surface-fill><ResultState {...(emptyActionHref ? {actionHref: emptyActionHref} : {})} empty={empty} labels={labels} result={{status: 'not-found'}} /></div>
  const referenceTime = Date.now()
  return <div className="feed-list">{result.data.items.map((post) => <PostCard canMutate={canMutate} key={post.id} labels={labels} locale={locale} post={post} referenceTime={referenceTime} {...(returnTo ? {returnTo} : {})} />)}{result.data.nextCursor && moreHref ? <Link className="load-more" href={moreHref}>{labels.loadMore}</Link> : null}</div>
}
