import type {FeedPage} from '@aifans/contracts'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'

export function FeedContent({result, locale, labels, empty = 'home', apiBaseUrl}: {result: SocialApiResult<FeedPage>; locale: Locale; labels: SocialLabels; empty?: 'home' | 'bookmarks'; apiBaseUrl?: string | undefined}) {
  if (result.status !== 'ok') return <ResultState labels={labels} result={result} />
  if (result.data.items.length === 0) return <ResultState empty={empty} labels={labels} result={{status: 'not-found'}} />
  return <div className="feed-list">{result.data.items.map((post) => <PostCard apiBaseUrl={apiBaseUrl} key={post.id} labels={labels} locale={locale} post={post} />)}</div>
}
