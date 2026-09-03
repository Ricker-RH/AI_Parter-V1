import {notFound} from 'next/navigation'
import {isLocale} from '../../../../i18n/config'
import {renderNotificationWorkspace} from './notification-page'
import {isCanonicalNotificationCursor} from '../../../../lib/auth/return-to'

export const instant = false

export default async function NotificationsPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{cursor?: string | string[]; [key: string]: string | string[] | undefined}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const query = await searchParams
  const cursor = Object.keys(query).every((key) => key === 'cursor') && typeof query.cursor === 'string' && isCanonicalNotificationCursor(query.cursor) ? query.cursor : undefined
  return renderNotificationWorkspace({locale, ...(cursor ? {cursor} : {})})
}
