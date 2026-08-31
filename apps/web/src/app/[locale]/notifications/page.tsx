import {notFound} from 'next/navigation'
import {NotificationsContent} from '../../../components/social/NotificationsContent'
import {getMessages, isLocale} from '../../../i18n/config'
import {fetchNotifications} from '../../../lib/social-api'
import {requestCookie} from '../../../lib/request-cookie'

export default async function NotificationsPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{cursor?: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const {cursor} = await searchParams
  const [messages, cookie] = await Promise.all([getMessages(locale), requestCookie()])
  const result = await fetchNotifications({cookie, cursor})
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/notifications?${new URLSearchParams({cursor: nextCursor})}` : undefined
  return <main><header className="page-header"><h1 className="page-title">{messages.notifications}</h1></header><NotificationsContent labels={messages} locale={locale} moreHref={moreHref} result={result} /></main>
}
