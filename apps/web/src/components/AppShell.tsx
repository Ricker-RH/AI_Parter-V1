'use client'

import type {ReactNode} from 'react'
import {usePathname} from 'next/navigation'
import type {Locale} from '../i18n/config'
import type {ShellLabels} from './AppNav'
import {AdminShell} from './admin/AdminShell'
import {AuthShell} from './shell/AuthShell'
import {CreatorShell} from './shell/CreatorShell'
import {MessagesShell} from './shell/MessagesShell'
import {PublicShell} from './shell/PublicShell'
import {resolveShellKind} from './shell/route-shell'
import {NavigationFeedback} from './NavigationFeedback'
import {RouteReadySignal} from './RouteReadySignal'

export function AppShell({authConfigured=false, creatorModeEnabled=true, locale, labels, children, release='local'}: {authConfigured?: boolean; creatorModeEnabled?: boolean; locale: Locale; labels: ShellLabels; children: ReactNode; release?: string}) {
  const pathname = usePathname()
  let shell: ReactNode
  switch (resolveShellKind(pathname)) {
    case 'admin': shell = <AdminShell authConfigured={authConfigured} locale={locale}>{children}</AdminShell>; break
    case 'auth': shell = <AuthShell>{children}</AuthShell>; break
    case 'messages': shell = <MessagesShell creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale}>{children}</MessagesShell>; break
    case 'creator': shell = <CreatorShell>{children}</CreatorShell>; break
    default: shell = <PublicShell creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} suppressMobileTopBar={/^\/(?:en|zh-CN)\/(?:posts|profiles)\/[^/]+$/.test(pathname)}>{children}</PublicShell>
  }
  return <div data-app-shell="shared-interactive" style={{display: 'contents'}}>{shell}<RouteReadySignal content={children}/><NavigationFeedback locale={locale} release={release}/></div>
}
