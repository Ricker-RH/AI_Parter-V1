import {notFound} from 'next/navigation'
import {getMessages, isLocale} from '../i18n/config'

export async function pageMessages(params: Promise<{locale: string}>) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  return getMessages(locale)
}
