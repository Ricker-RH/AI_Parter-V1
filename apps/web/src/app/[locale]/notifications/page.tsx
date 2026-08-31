import {notFound} from 'next/navigation'
import {NotificationsContent} from '../../../components/social/NotificationsContent'
import {getMessages, isLocale} from '../../../i18n/config'
import {fetchNotifications} from '../../../lib/social-api'
import {requestCookie} from '../../../lib/request-cookie'

export default async function NotificationsPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const [messages, result] = await Promise.all([getMessages(locale), requestCookie().then(fetchNotifications)])
  return <main><header className="page-header"><h1 className="page-title">{messages.notifications}</h1></header><NotificationsContent labels={messages} locale={locale} result={result} /></main>
}
