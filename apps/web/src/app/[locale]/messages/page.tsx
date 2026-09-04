import {notFound} from 'next/navigation'
import {CachedMessagesWorkspace} from '../../../components/chat/CachedMessagesWorkspace'
import {getMessages, isLocale} from '../../../i18n/config'
import {isCanonicalChatConversationCursor} from '../../../lib/auth/return-to'

export const instant = true

export default async function MessagesPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{cursor?: string | string[]; humanConversation?: string | string[]; [key: string]: string | string[] | undefined}>}) {
  const [{locale}, query] = await Promise.all([params, searchParams])
  if (!isLocale(locale)) notFound()
  const candidateCursor = query.cursor
  const selectedHumanId = Object.keys(query).length === 1 && typeof query.humanConversation === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.humanConversation) ? query.humanConversation : undefined
  const cursor = Object.keys(query).every((key) => key === 'cursor') && typeof candidateCursor === 'string' && isCanonicalChatConversationCursor(candidateCursor) ? candidateCursor : undefined
  const messages = await getMessages(locale)
  return <CachedMessagesWorkspace {...(cursor?{initialCursor:cursor}:{})} labels={messages.chat} locale={locale} {...(selectedHumanId?{selectedHumanId}:{})}/>
}
