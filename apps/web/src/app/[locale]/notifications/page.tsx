import {notFound} from 'next/navigation'
import {NotificationsContent} from '../../../components/social/NotificationsContent'
import {getMessages, isLocale} from '../../../i18n/config'
import {fetchNotifications} from '../../../lib/social-api'
import {requestCookie} from '../../../lib/request-cookie'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../lib/auth/access-policy'

export default async function NotificationsPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{cursor?: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const {cursor} = await searchParams
  const access = await requireAuthenticatedPage({locale, returnTo: `/${locale}/notifications${cursor ? `?${new URLSearchParams({cursor})}` : ''}`})
  const messages = await getMessages(locale)
  if (access.status === 'unavailable') return <main><header className="page-header"><h1 className="page-title">{messages.notifications}</h1></header><NotificationsContent labels={messages} locale={locale} result={{status: 'unavailable'}} /></main>
  const cookie = await requestCookie()
  const result = await fetchNotifications({cookie, cursor})
  if (result.status === 'auth-required') redirectToUserSignIn({locale, returnTo: `/${locale}/notifications${cursor ? `?${new URLSearchParams({cursor})}` : ''}`})
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/notifications?${new URLSearchParams({cursor: nextCursor})}` : undefined
  return <main><header className="page-header"><h1 className="page-title">{messages.notifications}</h1></header><NotificationsContent labels={messages} locale={locale} moreHref={moreHref} result={result} /></main>
}
