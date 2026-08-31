import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import '../globals.css'
import {AppShell} from '../../components/AppShell'
import {ThemeProvider} from '../../components/ThemeProvider'
import {getMessages, isLocale, locales} from '../../i18n/config'
import {AnalyticsProvider} from '../../lib/analytics/provider'

export function generateStaticParams() {
  return locales.map((locale) => ({locale}))
}

export async function generateMetadata({params}: {params: Promise<{locale: string}>}): Promise<Metadata> {
  const {locale: candidate} = await params
  if (!isLocale(candidate)) notFound()
  const messages = await getMessages(candidate)
  return {title: messages.metadataTitle, description: messages.metadataDescription}
}

export default async function LocaleLayout({children, params}: Readonly<{children: React.ReactNode; params: Promise<{locale: string}>}>) {
  const {locale: candidate} = await params
  if (!isLocale(candidate)) notFound()
  const messages = await getMessages(candidate)
  return <html lang={candidate} suppressHydrationWarning><body><AnalyticsProvider locale={candidate}><ThemeProvider><AppShell labels={messages} locale={candidate}>{children}</AppShell></ThemeProvider></AnalyticsProvider></body></html>
}
