import {notFound} from 'next/navigation'
import {FeedContent} from '../../../components/social/FeedContent'
import {getMessages, isLocale} from '../../../i18n/config'
import {fetchLiked} from '../../../lib/social-api'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../lib/auth/access-policy'
import {SocialSurface} from '../../../components/social/SocialSurface'

export default async function LikedPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{cursor?: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const {cursor} = await searchParams
  const returnTo = `/${locale}/liked${cursor ? `?${new URLSearchParams({cursor})}` : ''}`
  const access = await requireAuthenticatedPage({locale, returnTo})
  const messages = await getMessages(locale)
  const header = <header className="page-header collection-header"><h1 className="page-title">{messages.liked}</h1></header>
  if (access.status === 'unavailable') return <SocialSurface className="collection-page" header={header} label={messages.posts}><FeedContent empty="liked" emptyActionHref={`/${locale}`} labels={messages} locale={locale} result={{status: 'unavailable'}} /></SocialSurface>
  const result = await fetchLiked({cursor, token: access.token})
  if (result.status === 'auth-required') redirectToUserSignIn({locale, returnTo})
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/liked?${new URLSearchParams({cursor: nextCursor})}` : undefined
  return <SocialSurface className="collection-page" header={header} label={messages.posts}><FeedContent canMutate empty="liked" emptyActionHref={`/${locale}`} labels={messages} locale={locale} moreHref={moreHref} result={result} returnTo={returnTo} /></SocialSurface>
}
