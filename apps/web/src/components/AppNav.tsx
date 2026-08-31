'use client'

import {
  AifansBookmarkIcon,
  AifansHomeIcon,
  AifansMessageIcon,
  AifansNotificationIcon,
  AifansProfileIcon,
  AifansSearchIcon,
  AifansSettingsIcon,
  Logo,
} from '@aifans/ui'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import type {ComponentType, SVGProps} from 'react'
import type {Locale} from '../i18n/config'

export interface ShellLabels {
  primary: string
  home: string
  search: string
  notifications: string
  messages: string
  bookmarks: string
  profile: string
  settings: string
  creatorNav: string
  recommendations: string
  recommendationsEmpty: string
  more: string
}

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

export const navItems: ReadonlyArray<{key: keyof Pick<ShellLabels, 'home' | 'search' | 'notifications' | 'messages' | 'bookmarks' | 'profile' | 'settings' | 'creatorNav'>; href: string; icon: IconComponent}> = [
  {key: 'home', href: '', icon: AifansHomeIcon},
  {key: 'search', href: '/search', icon: AifansSearchIcon},
  {key: 'notifications', href: '/notifications', icon: AifansNotificationIcon},
  {key: 'messages', href: '/messages', icon: AifansMessageIcon},
  {key: 'bookmarks', href: '/bookmarks', icon: AifansBookmarkIcon},
  {key: 'profile', href: '/profile', icon: AifansProfileIcon},
  {key: 'creatorNav', href: '/creator', icon: AifansProfileIcon},
  {key: 'settings', href: '/settings', icon: AifansSettingsIcon},
]

function destination(locale: Locale, href: string) {
  return `/${locale}${href}`
}

function NavLink({item, locale, label, mobile = false}: {item: (typeof navItems)[number]; locale: Locale; label: string; mobile?: boolean}) {
  const pathname = usePathname()
  const href = destination(locale, item.href)
  const Icon = item.icon
  const active = pathname === href

  return <Link aria-current={active ? 'page' : undefined} className={mobile ? 'mobile-link' : 'nav-link'} href={href}><Icon aria-hidden="true" className="nav-icon" />{label}</Link>
}

export function visibleNavItems(creatorModeEnabled=true){return creatorModeEnabled?navItems:navItems.filter((item)=>item.key!=='creatorNav')}
export function AppNav({locale, labels,creatorModeEnabled=true}: {locale: Locale; labels: ShellLabels;creatorModeEnabled?:boolean}) {
  return <nav aria-label={labels.primary} className="desktop-nav"><div className="nav-sticky"><Link aria-label="AIFANS" className="brand" href={`/${locale}`}><Logo /></Link><p className="nav-title">{labels.primary}</p><div className="nav-list">{visibleNavItems(creatorModeEnabled).map((item) => <NavLink item={item} key={item.key} label={labels[item.key]} locale={locale} />)}</div></div></nav>
}
