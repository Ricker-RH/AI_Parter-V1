import Link from 'next/link'
import {getMessages, isLocale} from '../../i18n/config'
import {notFound} from 'next/navigation'
import {FeedContent} from '../../components/social/FeedContent'
import {fetchFeed} from '../../lib/social-api'
import {requestCookie} from '../../lib/request-cookie'

export default async function HomePage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{feed?: string; cursor?: string}>}) {
  const {locale: candidate} = await params
  if (!isLocale(candidate)) notFound()
  const messages = await getMessages(candidate)
  const query = await searchParams
  const following = query.feed === 'following'
  const result = await fetchFeed({kind: following ? 'following' : 'for_you', locale: candidate, cookie: await requestCookie(), cursor: query.cursor})
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const moreHref = nextCursor ? `/${candidate}?${new URLSearchParams(following ? {feed: 'following', cursor: nextCursor} : {cursor: nextCursor})}` : undefined
  return <main><header className="page-header"><h1 className="page-title">{messages.home}</h1><div aria-label={messages.home} className="tabs" role="tablist"><Link aria-selected={!following} className="tab" href={`/${candidate}`} role="tab">{messages.forYou}</Link><Link aria-selected={following} className="tab" href={`/${candidate}?feed=following`} role="tab">{messages.following}</Link></div></header><FeedContent labels={messages} locale={candidate} moreHref={moreHref} result={result} /></main>
}
