import {getMessages, isLocale} from '../../i18n/config'
import {notFound} from 'next/navigation'
import {FeedContent} from '../../components/social/FeedContent'
import {FeedTabs} from '../../components/social/FeedTabs'
import {fetchFeed} from '../../lib/social-api'
import {requestCookie} from '../../lib/request-cookie'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../lib/auth/access-policy'

const visualTypes = new Set(['realistic', 'anime', 'hybrid'])

type HomeSearchParams = Record<string, string | string[] | undefined>

function currentQueryString(values: HomeSearchParams) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string') query.append(key, value)
    else if (Array.isArray(value)) for (const item of value) query.append(key, item)
  }
  return query.toString()
}

export default async function HomePage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<HomeSearchParams>}) {
  const {locale: candidate} = await params
  if (!isLocale(candidate)) notFound()
  const messages = await getMessages(candidate)
  const query = await searchParams
  const following = query.feed === 'following'
  const visualType = typeof query.visualType === 'string' && visualTypes.has(query.visualType) ? query.visualType as 'realistic' | 'anime' | 'hybrid' : 'all'
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined
  const currentQuery = currentQueryString(query)
  if (following) {
    const access = await requireAuthenticatedPage({locale: candidate, returnTo: `/${candidate}?${currentQuery}`})
    if (access.status === 'unavailable') return <main><header className="page-header"><h1 className="page-title">{messages.home}</h1><FeedTabs currentQuery={currentQuery} following={following} labels={messages} locale={candidate} /></header><FeedContent currentQuery={currentQuery} feedKind="following" labels={messages} locale={candidate} result={{status: 'unavailable'}} visualType={visualType} /></main>
  }
  const result = await fetchFeed({kind: following ? 'following' : 'for_you', locale: candidate, visualType, cookie: await requestCookie(), cursor})
  if (result.status === 'auth-required') redirectToUserSignIn({locale: candidate, returnTo: following ? `/${candidate}?${currentQuery}` : `/${candidate}`})
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const pageQuery = new URLSearchParams()
  if (following) pageQuery.set('feed', 'following')
  if (visualType !== 'all') pageQuery.set('visualType', visualType)
  if (nextCursor) pageQuery.set('cursor', nextCursor)
  const moreHref = nextCursor ? `/${candidate}?${pageQuery}` : undefined
  return <main><header className="page-header"><h1 className="page-title">{messages.home}</h1><FeedTabs currentQuery={currentQuery} following={following} labels={messages} locale={candidate} /></header><FeedContent currentQuery={currentQuery} feedKind={following ? 'following' : 'for_you'} labels={messages} locale={candidate} moreHref={moreHref} result={result} visualType={visualType} /></main>
}
