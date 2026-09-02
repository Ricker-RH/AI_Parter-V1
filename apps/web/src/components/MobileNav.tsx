'use client'

import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {Suspense} from 'react'
import type {Locale} from '../i18n/config'
import {mobileNavItems, type ShellLabels} from './AppNav'

function MobileNavLinks({creatorModeEnabled, labels, locale, pathname}: {creatorModeEnabled: boolean; labels: ShellLabels; locale: Locale; pathname?: string}) {
  const items = creatorModeEnabled ? mobileNavItems : mobileNavItems.filter((item) => item.key !== 'creatorNav')
  const label = (key: (typeof mobileNavItems)[number]['key']) => key === 'forYou' ? labels.home : key === 'creatorNav' ? labels.creatorCenter ?? labels.creatorNav : key === 'collections' ? labels.collections ?? labels.activity ?? labels.bookmarks : key === 'profile' ? labels.myProfile ?? labels.profile : labels[key]
  return <nav aria-label={labels.primary} className="mobile-nav" data-count={items.length}>{items.map((item) => { const href = `/${locale}${item.href}`; const Icon = item.icon; const active = pathname === undefined ? false : item.key === 'messages' ? pathname === href || pathname.startsWith(`${href}/`) || pathname === `/${locale}/notifications` : pathname === href; return <Link aria-current={active ? 'page' : undefined} aria-label={label(item.key)} className="mobile-link" href={href} key={item.key}><Icon aria-hidden="true" className="nav-icon"/><span>{label(item.key)}</span></Link> })}</nav>
}

function PathAwareMobileNav(props: {creatorModeEnabled: boolean; labels: ShellLabels; locale: Locale}) {
  const pathname = usePathname()
  return <MobileNavLinks {...props} pathname={pathname}/>
}

export function MobileNav({locale, labels, creatorModeEnabled=true}: {locale: Locale; labels: ShellLabels; creatorModeEnabled?: boolean}) {
  const props = {creatorModeEnabled, labels, locale}
  return <Suspense fallback={<MobileNavLinks {...props}/> }><PathAwareMobileNav {...props}/></Suspense>
}
