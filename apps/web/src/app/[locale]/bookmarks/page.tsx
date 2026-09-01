import {notFound} from 'next/navigation'
import {FeedContent} from '../../../components/social/FeedContent'
import {getMessages, isLocale} from '../../../i18n/config'
import {fetchBookmarks} from '../../../lib/social-api'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../lib/auth/access-policy'

export default async function BookmarksPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{cursor?: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const {cursor} = await searchParams
  const access = await requireAuthenticatedPage({locale, returnTo: `/${locale}/bookmarks${cursor ? `?${new URLSearchParams({cursor})}` : ''}`})
  const messages = await getMessages(locale)
  if (access.status === 'unavailable') return <main><header className="page-header"><h1 className="page-title">{messages.bookmarks}</h1></header><FeedContent empty="bookmarks" labels={messages} locale={locale} result={{status: 'unavailable'}} /></main>
  const result = await fetchBookmarks({cursor, token: access.token})
  if (result.status === 'auth-required') redirectToUserSignIn({locale, returnTo: `/${locale}/bookmarks${cursor ? `?${new URLSearchParams({cursor})}` : ''}`})
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/bookmarks?${new URLSearchParams({cursor: nextCursor})}` : undefined
  return <main><header className="page-header"><h1 className="page-title">{messages.bookmarks}</h1></header><FeedContent canMutate empty="bookmarks" labels={messages} locale={locale} moreHref={moreHref} result={result} returnTo={`/${locale}/bookmarks${cursor ? `?${new URLSearchParams({cursor})}` : ''}`} /></main>
}
