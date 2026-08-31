import Link from 'next/link'
import {getMessages, isLocale} from '../../i18n/config'
import {notFound} from 'next/navigation'
import {FeedContent} from '../../components/social/FeedContent'
import {fetchFeed, publicSocialApiUrl} from '../../lib/social-api'
import {requestCookie} from '../../lib/request-cookie'

export default async function HomePage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{feed?: string}>}) {
  const {locale: candidate} = await params
  if (!isLocale(candidate)) notFound()
  const messages = await getMessages(candidate)
  const following = (await searchParams).feed === 'following'
  const result = await fetchFeed({kind: following ? 'following' : 'for_you', locale: candidate, cookie: await requestCookie()})
  return <main><header className="page-header"><h1 className="page-title">{messages.home}</h1><div aria-label={messages.home} className="tabs" role="tablist"><Link aria-selected={!following} className="tab" href={`/${candidate}`} role="tab">{messages.forYou}</Link><Link aria-selected={following} className="tab" href={`/${candidate}?feed=following`} role="tab">{messages.following}</Link></div></header><FeedContent apiBaseUrl={publicSocialApiUrl()} labels={messages} locale={candidate} result={result} /></main>
}
