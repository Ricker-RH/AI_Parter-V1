import {notFound} from 'next/navigation'
import {MessagesWorkspace} from '../../../../components/chat/MessagesWorkspace'
import {getMessages, isLocale} from '../../../../i18n/config'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../../lib/auth/access-policy'
import {fetchConversationHistory, fetchConversations} from '../../../../lib/chat-api'
import {fetchCurrentAccountResult} from '../../../../lib/current-account'
import {isCanonicalChatConversationCursor, isCanonicalChatMessageCursor} from '../../../../lib/auth/return-to'

export const instant = false

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function ConversationPage({params, searchParams}: {params: Promise<{locale: string; conversationId: string}>; searchParams: Promise<{cursor?: string | string[]; listCursor?: string | string[]; [key: string]: string | string[] | undefined}>}) {
  const {locale, conversationId} = await params
  if (!isLocale(locale) || !uuid.test(conversationId)) {
    notFound()
    return null
  }
  const query = await searchParams
  const listCursor = typeof query.listCursor === 'string' && isCanonicalChatConversationCursor(query.listCursor) ? query.listCursor : undefined
  const historyCursor = typeof query.cursor === 'string' && isCanonicalChatMessageCursor(query.cursor) ? query.cursor : undefined
  const returnQuery = new URLSearchParams()
  if (listCursor) returnQuery.set('listCursor', listCursor)
  if (historyCursor) returnQuery.set('cursor', historyCursor)
  const returnTo = `/${locale}/messages/${conversationId}${returnQuery.size ? `?${returnQuery}` : ''}`
  const access = await requireAuthenticatedPage({locale, returnTo})
  const messages = await getMessages(locale)
  if (access.status === 'unavailable') return <MessagesWorkspace items={[]} labels={messages.chat} listUnavailable locale={locale} snapshotViewerStatus="unavailable"/>
  const [list, history, viewer] = await Promise.all([fetchConversations({token: access.token, ...(listCursor ? {cursor: listCursor} : {})}), fetchConversationHistory(conversationId, {token: access.token, ...(historyCursor ? {cursor: historyCursor} : {})}),fetchCurrentAccountResult({token:access.token})])
  if (list.status === 'auth-required' || history.status === 'auth-required' || viewer.status==='auth-required') redirectToUserSignIn({locale, returnTo})
  if (history.status === 'not-found') notFound()
  const items = list.status === 'ok' ? list.data.items : []
  const nextCursor = list.status === 'ok' ? list.data.nextCursor : null
  return <MessagesWorkspace detailUnavailable={history.status === 'unavailable'} history={history.status === 'ok' ? history.data : undefined} initialCursor={listCursor} items={items} labels={messages.chat} listUnavailable={list.status === 'unavailable'} locale={locale} nextCursor={nextCursor} selectedId={conversationId} snapshotViewerId={viewer.status==='authenticated' ? viewer.account.id : undefined} snapshotViewerStatus={viewer.status==='authenticated' ? 'authenticated' : 'unavailable'}/>
}
