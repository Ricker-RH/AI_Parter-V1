import {notFound} from 'next/navigation'
import {MessagesWorkspace} from '../../../components/chat/MessagesWorkspace'
import {getMessages, isLocale} from '../../../i18n/config'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../lib/auth/access-policy'
import {fetchConversations} from '../../../lib/chat-api'

export default async function MessagesPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{cursor?: string | string[]}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const {cursor: candidateCursor} = await searchParams
  const cursor = typeof candidateCursor === 'string' ? candidateCursor : undefined
  const returnTo = `/${locale}/messages${cursor ? `?${new URLSearchParams({cursor})}` : ''}`
  const access = await requireAuthenticatedPage({locale, returnTo})
  const messages = await getMessages(locale)
  if (access.status === 'unavailable') return <main><p role="alert">{messages.chat.unavailable}</p></main>
  const result = await fetchConversations({token: access.token, ...(cursor ? {cursor} : {})})
  if (result.status === 'auth-required') redirectToUserSignIn({locale, returnTo})
  const items = result.status === 'ok' ? result.data.items : []
  const moreHref = result.status === 'ok' && result.data.nextCursor ? `/${locale}/messages?${new URLSearchParams({cursor: result.data.nextCursor})}` : undefined
  return <MessagesWorkspace items={items} labels={messages.chat} listUnavailable={result.status === 'unavailable'} locale={locale} moreHref={moreHref}/>
}
