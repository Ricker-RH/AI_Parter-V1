import {notFound} from 'next/navigation'
import {FeedContent} from '../../../components/social/FeedContent'
import {getMessages, isLocale} from '../../../i18n/config'
import {fetchBookmarks, publicSocialApiUrl} from '../../../lib/social-api'
import {requestCookie} from '../../../lib/request-cookie'

export default async function BookmarksPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const [messages, result] = await Promise.all([getMessages(locale), requestCookie().then(fetchBookmarks)])
  return <main><header className="page-header"><h1 className="page-title">{messages.bookmarks}</h1></header><FeedContent apiBaseUrl={publicSocialApiUrl()} empty="bookmarks" labels={messages} locale={locale} result={result} /></main>
}
