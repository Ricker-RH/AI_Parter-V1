import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import '../globals.css'
import {AppShell} from '../../components/AppShell'
import {PerformanceReporter} from '../../components/PerformanceReporter'
import {ThemeProvider} from '../../components/ThemeProvider'
import {getMessages, isLocale, locales} from '../../i18n/config'
import {AnalyticsProvider} from '../../lib/analytics/provider'
import {readWebAuthEnv} from '../../lib/auth/env'
import {isCreatorModeEnabled} from '../../lib/creator-mode'

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
  const authConfigured = readWebAuthEnv(process.env).status === 'configured'
  return <html lang={candidate} suppressHydrationWarning><body><AnalyticsProvider locale={candidate}><PerformanceReporter locale={candidate} /><ThemeProvider><AppShell authConfigured={authConfigured} creatorModeEnabled={isCreatorModeEnabled()} labels={messages} locale={candidate}>{children}</AppShell></ThemeProvider></AnalyticsProvider></body></html>
}
