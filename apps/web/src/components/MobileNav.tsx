'use client'

import Link from 'next/link'
import {usePathname} from 'next/navigation'
import type {Locale} from '../i18n/config'
import {mobileNavItems, type ShellLabels} from './AppNav'

export function MobileNav({locale, labels}: {locale: Locale; labels: ShellLabels; creatorModeEnabled?: boolean}) {
  const pathname = usePathname()
  return <nav aria-label={labels.primary} className="mobile-nav">{mobileNavItems.map((item) => { const href = `/${locale}${item.href}`; const Icon = item.icon; const label = item.key === 'forYou' ? labels.home : item.key === 'following' ? labels.following ?? 'Following' : labels[item.key]; return <Link aria-current={pathname === href ? 'page' : undefined} aria-label={label} className="mobile-link" href={href} key={item.key}><Icon aria-hidden="true" className="nav-icon"/><span>{label}</span></Link> })}</nav>
}
