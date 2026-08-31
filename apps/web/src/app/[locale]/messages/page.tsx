import {notFound} from 'next/navigation'
import {ChatPanel} from '../../../components/chat/ChatPanel'
import {getMessages, isLocale} from '../../../i18n/config'

export default async function MessagesPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const messages = await getMessages(locale)
  return <ChatPanel labels={messages.chat} locale={locale} />
}
