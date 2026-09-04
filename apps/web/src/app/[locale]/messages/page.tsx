import {notFound} from 'next/navigation'
import {MessagesWorkspace} from '../../../components/chat/MessagesWorkspace'
import {getMessages, isLocale} from '../../../i18n/config'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../lib/auth/access-policy'
import {fetchConversations} from '../../../lib/chat-api'
import {fetchCurrentAccountResult} from '../../../lib/current-account'
import {isCanonicalChatConversationCursor} from '../../../lib/auth/return-to'

export const instant = false

export default async function MessagesPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{cursor?: string | string[]; [key: string]: string | string[] | undefined}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const query = await searchParams
  const candidateCursor = query.cursor
  const selectedHumanId = Object.keys(query).length === 1 && typeof query.humanConversation === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.humanConversation) ? query.humanConversation : undefined
  const cursor = Object.keys(query).every((key) => key === 'cursor') && typeof candidateCursor === 'string' && isCanonicalChatConversationCursor(candidateCursor) ? candidateCursor : undefined
  const returnTo = `/${locale}/messages${selectedHumanId ? `?humanConversation=${selectedHumanId}` : cursor ? `?${new URLSearchParams({cursor})}` : ''}`
  const access = await requireAuthenticatedPage({locale, returnTo})
  const messages = await getMessages(locale)
  if (access.status === 'unavailable') return <MessagesWorkspace items={[]} labels={messages.chat} listUnavailable locale={locale} snapshotViewerStatus="unavailable"/>
  const viewer = await fetchCurrentAccountResult({token:access.token})
  if (viewer.status === 'auth-required') redirectToUserSignIn({locale, returnTo})
  if (viewer.status === 'authenticated' && viewer.account.kind === 'human') {
    return <MessagesWorkspace initialCursor={cursor} items={[]} labels={messages.chat} locale={locale} selectedHumanId={selectedHumanId} snapshotViewerId={viewer.account.id} snapshotViewerStatus="authenticated"/>
  }
  const result = await fetchConversations({token: access.token, ...(cursor ? {cursor} : {})})
  if (result.status === 'auth-required') redirectToUserSignIn({locale, returnTo})
  const items = result.status === 'ok' ? result.data.items : []
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  return <MessagesWorkspace initialCursor={cursor} items={items} labels={messages.chat} listUnavailable={result.status === 'unavailable'} locale={locale} nextCursor={nextCursor} selectedHumanId={selectedHumanId} snapshotViewerId={viewer.status==='authenticated' ? viewer.account.id : undefined} snapshotViewerStatus={viewer.status==='authenticated' ? 'authenticated' : 'unavailable'}/>
}
