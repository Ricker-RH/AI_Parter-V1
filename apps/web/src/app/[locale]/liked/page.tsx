import {notFound} from 'next/navigation'
import {FeedContent} from '../../../components/social/FeedContent'
import {getMessages, isLocale} from '../../../i18n/config'
import {fetchLiked} from '../../../lib/social-api'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../lib/auth/access-policy'

export default async function LikedPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{cursor?: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const {cursor} = await searchParams
  const returnTo = `/${locale}/liked${cursor ? `?${new URLSearchParams({cursor})}` : ''}`
  const access = await requireAuthenticatedPage({locale, returnTo})
  const messages = await getMessages(locale)
  if (access.status === 'unavailable') return <main className="collection-page"><header className="page-header collection-header"><h1 className="page-title">{messages.liked}</h1></header><FeedContent empty="liked" emptyActionHref={`/${locale}`} labels={messages} locale={locale} result={{status: 'unavailable'}} /></main>
  const result = await fetchLiked({cursor, token: access.token})
  if (result.status === 'auth-required') redirectToUserSignIn({locale, returnTo})
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/liked?${new URLSearchParams({cursor: nextCursor})}` : undefined
  return <main className="collection-page"><header className="page-header collection-header"><h1 className="page-title">{messages.liked}</h1></header><FeedContent canMutate empty="liked" emptyActionHref={`/${locale}`} labels={messages} locale={locale} moreHref={moreHref} result={result} returnTo={returnTo} /></main>
}
