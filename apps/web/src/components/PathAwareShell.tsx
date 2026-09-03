'use client'

import {Suspense, type ReactNode} from 'react'
import {usePathname} from 'next/navigation'
import type {Locale} from '../i18n/config'
import type {ShellLabels} from './AppNav'
import {AdminShell} from './admin/AdminShell'
import {AuthShell} from './shell/AuthShell'
import {CreatorShell} from './shell/CreatorShell'
import {MessagesShell} from './shell/MessagesShell'
import {PublicShell} from './shell/PublicShell'
import {resolveShellKind, shouldShowFloatingCreatorAction} from './shell/route-shell'
import {NavigationFeedback} from './NavigationFeedback'
import {RouteReadySignal} from './RouteReadySignal'
import {FloatingCreatorAction} from './FloatingCreatorAction'

export function PathAwareShell({authConfigured, children, creatorModeEnabled, labels, locale, release}: {authConfigured: boolean; children: ReactNode; creatorModeEnabled: boolean; labels: ShellLabels; locale: Locale; release: string}) {
  const pathname = usePathname()
  const showFloatingCreatorAction = creatorModeEnabled && shouldShowFloatingCreatorAction(pathname)
  const floatingCreatorAction = showFloatingCreatorAction ? <FloatingCreatorAction label={labels.creatorCenter ?? labels.creatorNav} locale={locale}/> : null
  let shell: ReactNode
  switch (resolveShellKind(pathname)) {
    case 'admin': shell = <AdminShell authConfigured={authConfigured} locale={locale}>{children}</AdminShell>; break
    case 'auth': shell = <AuthShell>{children}</AuthShell>; break
    case 'messages': shell = <MessagesShell floatingCreatorAction={floatingCreatorAction} labels={labels} locale={locale}>{children}</MessagesShell>; break
    case 'creator': shell = <CreatorShell>{children}</CreatorShell>; break
    default: shell = <PublicShell floatingCreatorAction={floatingCreatorAction} labels={labels} locale={locale} suppressMobileTopBar={/^\/(?:en|zh-CN)\/(?:posts|profiles)\/[^/]+$/.test(pathname)}>{children}</PublicShell>
  }
  return <>{shell}<Suspense fallback={null}><RouteReadySignal content={children}/></Suspense><Suspense fallback={null}><NavigationFeedback locale={locale} release={release}/></Suspense></>
}
