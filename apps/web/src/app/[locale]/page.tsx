import {getMessages, isLocale} from '../../i18n/config'
import {notFound} from 'next/navigation'
import {FeedContent} from '../../components/social/FeedContent'
import {FeedTabs} from '../../components/social/FeedTabs'
import {fetchFeed} from '../../lib/social-api'
import {requestCookie} from '../../lib/request-cookie'

const visualTypes = new Set(['realistic', 'anime', 'hybrid'])

export default async function HomePage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{feed?: string; cursor?: string; visualType?: string}>}) {
  const {locale: candidate} = await params
  if (!isLocale(candidate)) notFound()
  const messages = await getMessages(candidate)
  const query = await searchParams
  const following = query.feed === 'following'
  const visualType = visualTypes.has(query.visualType ?? '') ? query.visualType as 'realistic' | 'anime' | 'hybrid' : 'all'
  const result = await fetchFeed({kind: following ? 'following' : 'for_you', locale: candidate, visualType, cookie: await requestCookie(), cursor: query.cursor})
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const pageQuery = new URLSearchParams()
  if (following) pageQuery.set('feed', 'following')
  if (visualType !== 'all') pageQuery.set('visualType', visualType)
  if (nextCursor) pageQuery.set('cursor', nextCursor)
  const moreHref = nextCursor ? `/${candidate}?${pageQuery}` : undefined
  return <main><header className="page-header"><h1 className="page-title">{messages.home}</h1><FeedTabs following={following} labels={messages} locale={candidate} /></header><FeedContent feedKind={following ? 'following' : 'for_you'} labels={messages} locale={candidate} moreHref={moreHref} result={result} visualType={visualType} /></main>
}
