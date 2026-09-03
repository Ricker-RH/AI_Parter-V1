import {notFound} from 'next/navigation'
import {isLocale} from '../../../../../i18n/config'
import {renderNotificationWorkspace} from '../notification-page'
import {isCanonicalNotificationCursor} from '../../../../../lib/auth/return-to'

export const instant = false
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function NotificationPage({params, searchParams}: {params: Promise<{locale: string; notificationId: string}>; searchParams: Promise<{listCursor?: string | string[]; [key: string]: string | string[] | undefined}>}) {
  const {locale, notificationId} = await params
  if (!isLocale(locale) || !uuid.test(notificationId)) { notFound(); return null }
  const query = await searchParams
  const cursor = Object.keys(query).every((key) => key === 'listCursor') && typeof query.listCursor === 'string' && isCanonicalNotificationCursor(query.listCursor) ? query.listCursor : undefined
  return renderNotificationWorkspace({locale, notificationId, ...(cursor ? {cursor} : {})})
}
