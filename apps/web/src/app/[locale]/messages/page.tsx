import {notFound} from 'next/navigation'
import {ChatPanel} from '../../../components/chat/ChatPanel'
import {getMessages, isLocale} from '../../../i18n/config'
import {requireAuthenticatedPage} from '../../../lib/auth/access-policy'

export default async function MessagesPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const messages = await getMessages(locale)
  const access = await requireAuthenticatedPage({locale, returnTo: `/${locale}/messages`})
  if (access.status === 'unavailable') return <main><p role="alert">{messages.unavailableDescription}</p></main>
  return <ChatPanel labels={messages.chat} locale={locale} />
}
