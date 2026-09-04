'use client'

import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {Suspense} from 'react'
import type {Locale} from '../i18n/config'
import {mobileNavItems, type ShellLabels} from './AppNav'
import {isNavigationActive} from './navigation-active'

function MobileNavLinks({labels, locale, pathname}: {labels: ShellLabels; locale: Locale; pathname?: string}) {
  const label = (key: (typeof mobileNavItems)[number]['key']) => key === 'forYou' ? labels.home : key === 'channels' ? labels.channels ?? 'Channels' : key === 'profile' ? labels.myNav ?? labels.myProfile ?? labels.profile : labels[key]
  return <nav aria-label={labels.primary} className="mobile-nav" data-count={mobileNavItems.length}>{mobileNavItems.map((item) => { const href = `/${locale}${item.href}`; const Icon = item.icon; const active = pathname === undefined ? false : isNavigationActive(item, locale, pathname); return <Link aria-current={active ? 'page' : undefined} aria-label={label(item.key)} className="mobile-link" href={href} key={item.key} prefetch><Icon aria-hidden="true" className="nav-icon"/><span>{label(item.key)}</span></Link> })}</nav>
}

function PathAwareMobileNav(props: {labels: ShellLabels; locale: Locale}) {
  const pathname = usePathname()
  return <MobileNavLinks {...props} pathname={pathname}/>
}

export function MobileNav({locale, labels}: {locale: Locale; labels: ShellLabels}) {
  const props = {labels, locale}
  return <Suspense fallback={<MobileNavLinks {...props}/> }><PathAwareMobileNav {...props}/></Suspense>
}
