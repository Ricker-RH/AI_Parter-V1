'use client'

import {Logo} from '@aifans/ui'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import type {ReactNode} from 'react'
import type {Locale} from '../../i18n/config'
import {AuthAccountControl} from '../auth/AuthAccountControl'

const copy = {
  en: {
    aria: 'Admin navigation',
    eyebrow: 'AIFANS Admin',
    operations: 'Content operations',
    creator: 'Creator review',
    returnToSite: 'Return to user site',
  },
  'zh-CN': {
    aria: '管理后台导航',
    eyebrow: 'AIFANS 管理后台',
    operations: '内容运营',
    creator: '创作者审核',
    returnToSite: '返回用户站',
  },
} satisfies Record<Locale, Record<string, string>>

export function AdminShell({
  authConfigured,
  children,
  locale,
}: {
  authConfigured: boolean
  children: ReactNode
  locale: Locale
}) {
  const pathname = usePathname()
  const labels = copy[locale]
  const items = [
    {href: `/${locale}/admin`, label: labels.operations},
    {href: `/${locale}/admin/creator`, label: labels.creator},
  ]

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link aria-label="AIFANS Admin" className="admin-brand" href={`/${locale}/admin`}><Logo /></Link>
      <p className="admin-shell-eyebrow">{labels.eyebrow}</p>
      <nav aria-label={labels.aria} className="admin-shell-nav">
        {items.map((item) => <Link aria-current={pathname === item.href ? 'page' : undefined} href={item.href} key={item.href}>{item.label}</Link>)}
      </nav>
      <div className="admin-shell-footer">
        <Link aria-label={labels.returnToSite} className="admin-return-link" href={`/${locale}`}>← {labels.returnToSite}</Link>
        <AuthAccountControl configured={authConfigured} locale={locale} />
      </div>
    </aside>
    <div className="admin-shell-content">{children}</div>
  </div>
}
