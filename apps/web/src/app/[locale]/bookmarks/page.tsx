import {notFound} from 'next/navigation'
import {FeedContent} from '../../../components/social/FeedContent'
import {getMessages, isLocale} from '../../../i18n/config'
import {fetchBookmarks} from '../../../lib/social-api'
import {requestCookie} from '../../../lib/request-cookie'

export default async function BookmarksPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{cursor?: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const {cursor} = await searchParams
  const [messages, cookie] = await Promise.all([getMessages(locale), requestCookie()])
  const result = await fetchBookmarks({cookie, cursor})
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/bookmarks?${new URLSearchParams({cursor: nextCursor})}` : undefined
  return <main><header className="page-header"><h1 className="page-title">{messages.bookmarks}</h1></header><FeedContent empty="bookmarks" labels={messages} locale={locale} moreHref={moreHref} result={result} /></main>
}
