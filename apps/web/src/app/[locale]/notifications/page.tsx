import {notFound, redirect} from 'next/navigation'
import {isLocale} from '../../../i18n/config'

export const instant = false

export default async function NotificationsPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{cursor?: string | string[]}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const rawCursor = (await searchParams).cursor
  const cursor = typeof rawCursor === 'string' ? rawCursor : undefined
  redirect(`/${locale}/messages/notifications${cursor ? `?${new URLSearchParams({cursor})}` : ''}`)
}
