import type {Metadata} from 'next'
import {cacheLife} from 'next/cache'
import {notFound} from 'next/navigation'
import {locale as rootLocale} from 'next/root-params'
import {Suspense} from 'react'
import '../globals.css'
import {AppShell} from '../../components/AppShell'
import {PerformanceReporter} from '../../components/PerformanceReporter'
import {ThemeProvider} from '../../components/ThemeProvider'
import {getMessages, isLocale, locales} from '../../i18n/config'
import {AnalyticsProvider} from '../../lib/analytics/provider'
import {readWebAuthEnv} from '../../lib/auth/env'
import {isCreatorModeEnabled} from '../../lib/creator-mode'
import {analyticsRelease} from '../../lib/analytics/release'
import {RootLocaleSync} from '../../components/RootLocaleSync'
import {CurrentAccountProvider} from '../../components/account/CurrentAccountProvider'
import {AppQueryProvider} from '../../components/AppQueryProvider'

export const ROOT_LOCALE_SCRIPT = "(function(){var path=location.pathname,match=/^\\/(en|zh-CN)(?=\\/|$)(.*)$/.exec(path),locale=match?match[1]:'en',rest=match&&match[2]||'',shell=rest==='/admin'||rest.indexOf('/admin/')===0?'admin':rest==='/creator'||rest.indexOf('/creator/')===0?'creator':rest==='/messages'||rest.indexOf('/messages/')===0||rest==='/notifications'?'messages':rest==='/auth'||rest.indexOf('/auth/')===0?'auth':'public';document.documentElement.lang=locale;document.documentElement.setAttribute('data-route-shell',shell)})()"

export function generateStaticParams() {
  return locales.map((locale) => ({locale}))
}

export async function generateMetadata(): Promise<Metadata> {
  const candidate = await rootLocale()
  if (!isLocale(candidate)) notFound()
  const messages = await getMessages(candidate)
  return {title: messages.metadataTitle, description: messages.metadataDescription}
}

export default function LocaleLayout({children}: Readonly<{children: React.ReactNode}>) {
  const authConfigured = readWebAuthEnv(process.env).status === 'configured'
  const creatorModeEnabled = isCreatorModeEnabled()
  const release = analyticsRelease(process.env)
  return <html data-route-shell="public" lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html: ROOT_LOCALE_SCRIPT}} /></head><body><Suspense fallback={null}><RootLocaleSync/></Suspense><LocalizedAppShellBody authConfigured={authConfigured} creatorModeEnabled={creatorModeEnabled} release={release}>{children}</LocalizedAppShellBody></body></html>
}

async function LocalizedAppShellBody({authConfigured, children, creatorModeEnabled, release}: Readonly<{authConfigured: boolean; children: React.ReactNode; creatorModeEnabled: boolean; release: string}>) {
  'use cache'
  cacheLife('max')
  const candidate = await rootLocale()
  if (!isLocale(candidate)) notFound()
  const messages = await getMessages(candidate)
  return <AnalyticsProvider locale={candidate}><Suspense fallback={null}><PerformanceReporter locale={candidate} release={release} /></Suspense><ThemeProvider><CurrentAccountProvider><AppQueryProvider><AppShell authConfigured={authConfigured} creatorModeEnabled={creatorModeEnabled} labels={messages} locale={candidate} release={release}>{children}</AppShell></AppQueryProvider></CurrentAccountProvider></ThemeProvider></AnalyticsProvider>
}
