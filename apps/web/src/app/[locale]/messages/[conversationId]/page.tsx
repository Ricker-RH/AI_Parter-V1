import {notFound} from 'next/navigation'
import {MessagesWorkspace} from '../../../../components/chat/MessagesWorkspace'
import {getMessages, isLocale} from '../../../../i18n/config'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../../lib/auth/access-policy'
import {fetchConversationHistory, fetchConversations} from '../../../../lib/chat-api'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function ConversationPage({params}: {params: Promise<{locale: string; conversationId: string}>; searchParams: Promise<{cursor?: string | string[]}>}) {
  const {locale, conversationId} = await params
  if (!isLocale(locale) || !uuid.test(conversationId)) {
    notFound()
    return null
  }
  const returnTo = `/${locale}/messages/${conversationId}`
  const access = await requireAuthenticatedPage({locale, returnTo})
  const messages = await getMessages(locale)
  if (access.status === 'unavailable') return <MessagesWorkspace items={[]} labels={messages.chat} listUnavailable locale={locale}/>
  const [list, history] = await Promise.all([fetchConversations({token: access.token}), fetchConversationHistory(conversationId, {token: access.token})])
  if (list.status === 'auth-required' || history.status === 'auth-required') redirectToUserSignIn({locale, returnTo})
  if (history.status === 'not-found') notFound()
  const items = list.status === 'ok' ? list.data.items : []
  const moreHref = list.status === 'ok' && list.data.nextCursor ? `/${locale}/messages?${new URLSearchParams({cursor: list.data.nextCursor})}` : undefined
  return <MessagesWorkspace detailUnavailable={history.status === 'unavailable'} history={history.status === 'ok' ? history.data : undefined} items={items} labels={messages.chat} listUnavailable={list.status === 'unavailable'} locale={locale} moreHref={moreHref} selectedId={conversationId}/>
}
