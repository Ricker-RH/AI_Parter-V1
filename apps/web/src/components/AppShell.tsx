import {Suspense, type ReactNode} from 'react'
import type {Locale} from '../i18n/config'
import type {ShellLabels} from './AppNav'
import {PathAwareShell} from './PathAwareShell'
import {LoadingScreen} from './shell/LoadingScreen'
import {PublicShell} from './shell/PublicShell'

export function AppShell({authConfigured=false, creatorModeEnabled=true, locale, labels, children, release='local'}: {authConfigured?: boolean; creatorModeEnabled?: boolean; locale: Locale; labels: ShellLabels; children: ReactNode; release?: string}) {
  const fallback = <><div className="route-shell-fallback-public"><PublicShell labels={labels} locale={locale}>{children}</PublicShell></div><div className="route-shell-fallback-loading"><LoadingScreen/></div></>
  return <div data-app-shell="shared-interactive" style={{display: 'contents'}}><Suspense fallback={fallback}><PathAwareShell authConfigured={authConfigured} creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} release={release}>{children}</PathAwareShell></Suspense></div>
}
