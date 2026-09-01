'use client'

import {AifansBookmarkIcon, AifansHomeIcon, AifansMessageIcon, AifansNotificationIcon, AifansProfileIcon, AifansSearchIcon, AifansSettingsIcon, Logo} from '@aifans/ui'
import Link from 'next/link'
import {usePathname, useSearchParams} from 'next/navigation'
import {useState} from 'react'
import type {ComponentType, SVGProps} from 'react'
import type {Locale} from '../i18n/config'
import {GlobalMoreMenu, type MoreMenuLabels} from './GlobalMoreMenu'

export interface ShellLabels extends MoreMenuLabels { primary: string; home: string; forYou?: string; following?: string; search: string; notifications: string; messages: string; bookmarks: string; profile: string; settings: string; creatorNav: string; creatorCenter?: string; activity?: string; myProfile?: string; recommendations: string; recommendationsEmpty: string }
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>
type NavItem = {key: keyof Pick<ShellLabels, 'forYou' | 'following' | 'search' | 'notifications' | 'messages' | 'bookmarks' | 'profile' | 'settings' | 'creatorNav'>; href: string; icon: IconComponent}
function CreatorPlusIcon(props: SVGProps<SVGSVGElement>) { return <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}><path d="M12 5v14M5 12h14"/></svg> }

export const navItems: ReadonlyArray<NavItem> = [
  {key: 'forYou', href: '', icon: AifansHomeIcon}, {key: 'following', href: '?feed=following', icon: AifansHomeIcon}, {key: 'search', href: '/search', icon: AifansSearchIcon}, {key: 'messages', href: '/messages', icon: AifansMessageIcon}, {key: 'notifications', href: '/notifications', icon: AifansNotificationIcon}, {key: 'bookmarks', href: '/bookmarks', icon: AifansBookmarkIcon}, {key: 'profile', href: '/profile', icon: AifansProfileIcon}, {key: 'creatorNav', href: '/creator', icon: CreatorPlusIcon}, {key: 'settings', href: '/settings', icon: AifansSettingsIcon},
]

function destination(locale: Locale, href: string) { return `/${locale}${href}` }
function NavLink({item, locale, label, compact}: {item: NavItem; locale: Locale; label: string; compact?: boolean}) {
  const pathname = usePathname(); const search = useSearchParams(); const href = destination(locale, item.href); const Icon = item.icon
  const active = item.key === 'following' ? pathname === `/${locale}` && search.get('feed') === 'following' : item.key === 'forYou' ? pathname === href && search.get('feed') !== 'following' : pathname === href
  return <Link aria-current={active ? 'page' : undefined} aria-label={label} className="nav-link" href={href}><Icon aria-hidden="true" className="nav-icon"/><span className={compact ? 'nav-link-label sr-only' : 'nav-link-label'}>{label}</span></Link>
}
export function visibleNavItems(creatorModeEnabled=true) { return creatorModeEnabled ? navItems : navItems.filter((item) => item.key !== 'creatorNav') }
export const mobileNavItems = ['forYou', 'messages', 'creatorNav', 'notifications', 'profile'].map((key) => navItems.find((item) => item.key === key)!).filter(Boolean)

export function AppNav({locale, labels, creatorModeEnabled=true, compact=false}: {locale: Locale; labels: ShellLabels; creatorModeEnabled?: boolean; compact?: boolean}) {
  const [expanded, setExpanded] = useState(false); const items = visibleNavItems(creatorModeEnabled)
  const label = (key: NavItem['key']) => key === 'forYou' ? labels.forYou ?? labels.home : key === 'following' ? labels.following ?? 'Following' : labels[key]
  return <nav aria-label={labels.primary} className={compact ? 'desktop-nav desktop-nav-compact' : 'desktop-nav'} data-compact={compact ? 'true' : undefined} data-expanded={expanded || undefined}><div className="nav-sticky"><Link aria-label="AIFANS" className="brand" href={`/${locale}`}><Logo className="brand-logo-full"/><Logo className="brand-logo-compact" showWordmark={false}/></Link><div className="rail-controls"><button aria-expanded={expanded} className="rail-expand" onClick={() => setExpanded((value) => !value)} type="button">{labels.more}</button></div><p className={compact ? 'nav-title sr-only' : 'nav-title'}>{labels.primary}</p><div className="nav-list">{items.map((item) => <NavLink compact={compact} item={item} key={item.key} label={label(item.key)} locale={locale}/>)}</div><GlobalMoreMenu labels={labels} locale={locale}/></div></nav>
}
