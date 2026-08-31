'use client'

import type {Locale} from '../i18n/config'
import {navItems, type ShellLabels} from './AppNav'
import {usePathname} from 'next/navigation'
import Link from 'next/link'

export function MobileNav({locale, labels}: {locale: Locale; labels: ShellLabels}) {
  const pathname = usePathname()
  const mobileItems = navItems.slice(0, 5)
  return <nav aria-label={labels.primary} className="mobile-nav">{mobileItems.map((item) => {
    const href = `/${locale}${item.href}`
    const Icon = item.icon
    return <Link aria-current={pathname === href ? 'page' : undefined} className="mobile-link" href={href} key={item.key}><Icon aria-hidden="true" className="nav-icon" />{labels[item.key]}</Link>
  })}</nav>
}
