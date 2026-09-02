import {notFound} from 'next/navigation'
import {NotificationsContent} from '../../../components/social/NotificationsContent'
import {MessagesSectionHeader} from '../../../components/chat/MessagesSectionHeader'
import styles from '../../../components/chat/MessagesWorkspace.module.css'
import {getMessages, isLocale} from '../../../i18n/config'
import {fetchNotifications} from '../../../lib/social-api'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../lib/auth/access-policy'

export default async function NotificationsPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{cursor?: string | string[]}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const rawCursor = (await searchParams).cursor
  const cursor = typeof rawCursor === 'string' ? rawCursor : undefined
  const access = await requireAuthenticatedPage({locale, returnTo: `/${locale}/notifications${cursor ? `?${new URLSearchParams({cursor})}` : ''}`})
  const messages = await getMessages(locale)
  if (access.status === 'unavailable') return <main className={styles.notificationsPage}><MessagesSectionHeader active="notifications" labels={messages.chat} locale={locale}/><NotificationsContent labels={messages} locale={locale} result={{status: 'unavailable'}} /></main>
  const result = await fetchNotifications({cursor, token: access.token})
  if (result.status === 'auth-required') redirectToUserSignIn({locale, returnTo: `/${locale}/notifications${cursor ? `?${new URLSearchParams({cursor})}` : ''}`})
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/notifications?${new URLSearchParams({cursor: nextCursor})}` : undefined
  return <main className={styles.notificationsPage}><MessagesSectionHeader active="notifications" labels={messages.chat} locale={locale}/><NotificationsContent labels={messages} locale={locale} moreHref={moreHref} result={result} /></main>
}
