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

export function AppShell({authConfigured=false, creatorModeEnabled=true, locale, labels, children}: {authConfigured?: boolean; creatorModeEnabled?: boolean; locale: Locale; labels: ShellLabels; children: ReactNode}) {
  const pathname = usePathname()
  switch (resolveShellKind(pathname)) {
    case 'admin': return <AdminShell authConfigured={authConfigured} locale={locale}>{children}</AdminShell>
    case 'auth': return <AuthShell>{children}</AuthShell>
    case 'messages': return <MessagesShell creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale}>{children}</MessagesShell>
    case 'creator': return <CreatorShell>{children}</CreatorShell>
    default: return <PublicShell creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale}>{children}</PublicShell>
  }
}
