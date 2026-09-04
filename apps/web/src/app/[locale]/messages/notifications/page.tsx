import {notFound} from 'next/navigation'
import {CachedNotificationsWorkspace} from '../../../../components/chat/CachedNotificationsWorkspace'
import {getMessages, isLocale} from '../../../../i18n/config'
import {isCanonicalNotificationCursor} from '../../../../lib/auth/return-to'

export const instant = true

export default async function NotificationsPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{cursor?: string | string[]; [key: string]: string | string[] | undefined}>}) {
  const [{locale}, query] = await Promise.all([params, searchParams])
  if (!isLocale(locale)) notFound()
  const cursor = Object.keys(query).every((key) => key === 'cursor') && typeof query.cursor === 'string' && isCanonicalNotificationCursor(query.cursor) ? query.cursor : undefined
  const labels = await getMessages(locale)
  return <CachedNotificationsWorkspace {...(cursor ? {cursor} : {})} labels={labels} locale={locale}/>
}
