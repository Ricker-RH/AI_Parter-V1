'use client'

import Link from 'next/link'
import {usePathname} from 'next/navigation'
import type {Locale} from '../i18n/config'
import {mobileNavItems, type ShellLabels} from './AppNav'

export function MobileNav({locale, labels, creatorModeEnabled=true}: {locale: Locale; labels: ShellLabels; creatorModeEnabled?: boolean}) {
  const pathname = usePathname()
  const items = creatorModeEnabled ? mobileNavItems : mobileNavItems.filter((item) => item.key !== 'creatorNav')
  const label = (key: (typeof mobileNavItems)[number]['key']) => key === 'forYou' ? labels.home : key === 'creatorNav' ? labels.creatorCenter ?? labels.creatorNav : key === 'notifications' ? labels.activity ?? labels.notifications : key === 'profile' ? labels.myProfile ?? labels.profile : labels[key]
  return <nav aria-label={labels.primary} className="mobile-nav" data-count={items.length}>{items.map((item) => { const href = `/${locale}${item.href}`; const Icon = item.icon; return <Link aria-current={pathname === href ? 'page' : undefined} aria-label={label(item.key)} className="mobile-link" href={href} key={item.key}><Icon aria-hidden="true" className="nav-icon"/><span>{label(item.key)}</span></Link> })}</nav>
}
