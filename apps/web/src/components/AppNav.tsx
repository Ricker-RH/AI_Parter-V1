'use client'

import {AifansBookmarkIcon, AifansHomeIcon, AifansMessageIcon, AifansNotificationIcon, AifansProfileIcon, AifansSearchIcon, Logo} from '@aifans/ui'
import Link from 'next/link'
import {usePathname, useSearchParams} from 'next/navigation'
import {Suspense, useState} from 'react'
import type {ComponentType, SVGProps} from 'react'
import type {Locale} from '../i18n/config'
import {GlobalMoreMenu, type MoreMenuLabels} from './GlobalMoreMenu'

export interface ShellLabels extends MoreMenuLabels { primary: string; home: string; forYou?: string; following?: string; search: string; notifications: string; messages: string; liked?: string; bookmarks: string; profile: string; settings: string; creatorNav: string; creatorCenter?: string; activity?: string; myProfile?: string; expandNavigation?: string; recommendations: string; recommendationsEmpty: string }
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>
type NavItem = {key: keyof Pick<ShellLabels, 'forYou' | 'following' | 'search' | 'notifications' | 'messages' | 'liked' | 'bookmarks' | 'profile' | 'creatorNav'>; href: string; icon: IconComponent}
function CreatorPlusIcon(props: SVGProps<SVGSVGElement>) { return <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}><path d="M12 5v14M5 12h14"/></svg> }
function LikedIcon(props: SVGProps<SVGSVGElement>) { return <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" {...props}><path d="M20.8 8.7c0 5.2-8.8 10.3-8.8 10.3S3.2 13.9 3.2 8.7A4.5 4.5 0 0 1 12 6.5a4.5 4.5 0 0 1 8.8 2.2Z"/></svg> }

export const navItems: ReadonlyArray<NavItem> = [
  {key: 'forYou', href: '', icon: AifansHomeIcon}, {key: 'following', href: '?feed=following', icon: AifansHomeIcon}, {key: 'search', href: '/search', icon: AifansSearchIcon}, {key: 'messages', href: '/messages', icon: AifansMessageIcon}, {key: 'notifications', href: '/notifications', icon: AifansNotificationIcon}, {key: 'liked', href: '/liked', icon: LikedIcon}, {key: 'bookmarks', href: '/bookmarks', icon: AifansBookmarkIcon}, {key: 'profile', href: '/profile', icon: AifansProfileIcon}, {key: 'creatorNav', href: '/creator', icon: CreatorPlusIcon},
]

function destination(locale: Locale, href: string) { return `/${locale}${href}` }
function NavLink({item, locale, label, compact, following}: {item: NavItem; locale: Locale; label: string; compact?: boolean; following?: boolean | undefined}) {
  const pathname = usePathname(); const href = destination(locale, item.href); const Icon = item.icon
  const active = item.key === 'following' ? pathname === `/${locale}` && following : item.key === 'forYou' ? pathname === href && following === false : pathname === href
  return <Link aria-current={active ? 'page' : undefined} aria-label={label} className="nav-link" href={href}><Icon aria-hidden="true" className="nav-icon"/><span className={compact ? 'nav-link-label sr-only' : 'nav-link-label'}>{label}</span></Link>
}
function NavList({items, labels, locale, compact, following}: {items: ReadonlyArray<NavItem>; labels: ShellLabels; locale: Locale; compact: boolean; following?: boolean}) { const label = (key: NavItem['key']) => key === 'forYou' ? labels.forYou ?? labels.home : key === 'following' ? labels.following ?? 'Following' : key === 'liked' ? labels.liked ?? 'Liked' : labels[key]; return <div className="nav-list">{items.map((item) => <NavLink compact={compact} following={following} item={item} key={item.key} label={label(item.key)} locale={locale}/>)}</div> }
function QueryAwareNavList(props: Omit<Parameters<typeof NavList>[0], 'following'>) { const search = useSearchParams(); return <NavList {...props} following={search.get('feed') === 'following'}/> }
export function visibleNavItems(_creatorModeEnabled=true) { return navItems.filter((item) => item.key !== 'creatorNav') }
export const mobileNavItems = ['forYou', 'messages', 'creatorNav', 'notifications', 'profile'].map((key) => navItems.find((item) => item.key === key)!).filter(Boolean).map((item) => item.key === 'notifications' ? {...item, href: '/activity'} : item)

export function AppNav({locale, labels, creatorModeEnabled=true, compact=false}: {locale: Locale; labels: ShellLabels; creatorModeEnabled?: boolean; compact?: boolean}) {
  const [expanded, setExpanded] = useState(false); const items = visibleNavItems(creatorModeEnabled); const expandLabel = labels.expandNavigation ?? labels.more
  return <nav aria-label={labels.primary} className={compact ? 'desktop-nav desktop-nav-compact' : 'desktop-nav'} data-compact={compact ? 'true' : undefined} data-expanded={expanded || undefined}><div className="nav-sticky"><Link aria-label="AIFANS" className="brand" href={`/${locale}`}><Logo className="brand-logo-full"/><Logo className="brand-logo-compact" showWordmark={false}/></Link><div className="rail-controls"><button aria-expanded={expanded} aria-label={expandLabel} className="rail-expand" onClick={() => setExpanded((value) => !value)} type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button></div><p className={compact ? 'nav-title sr-only' : 'nav-title'}>{labels.primary}</p><Suspense fallback={<NavList compact={compact} items={items} labels={labels} locale={locale}/> }><QueryAwareNavList compact={compact} items={items} labels={labels} locale={locale}/></Suspense><GlobalMoreMenu labels={labels} locale={locale}/></div></nav>
}
