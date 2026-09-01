'use client'

import type {ReactNode} from 'react'
import {usePathname} from 'next/navigation'
import type {Locale} from '../i18n/config'
import {AppNav, type ShellLabels} from './AppNav'
import {MobileNav} from './MobileNav'
import {RightRail} from './RightRail'
import {AdminShell} from './admin/AdminShell'

export function AppShell({authConfigured=false, creatorModeEnabled=true, locale, labels, children}: {authConfigured?: boolean; creatorModeEnabled?: boolean; locale: Locale; labels: ShellLabels; children: ReactNode}) {
  const pathname = usePathname()
  const adminRoot = `/${locale}/admin`
  if (pathname === adminRoot || pathname.startsWith(`${adminRoot}/`)) {
    return <AdminShell authConfigured={authConfigured} locale={locale}>{children}</AdminShell>
  }
  return <div className="shell"><AppNav creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} /><div className="content">{children}</div><RightRail labels={labels} /><MobileNav creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} /></div>
}
