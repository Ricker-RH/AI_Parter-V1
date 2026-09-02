'use client'

import {AifansBookmarkIcon, AifansFollowingIcon, AifansHomeIcon, AifansMessageIcon, AifansNotificationIcon, AifansProfileIcon, AifansSearchIcon, Logo} from '@aifans/ui'
import Link from 'next/link'
import {usePathname, useSearchParams} from 'next/navigation'
import {Suspense} from 'react'
import type {ComponentType, SVGProps} from 'react'
import type {Locale} from '../i18n/config'
import {GlobalMoreMenu, type MoreMenuLabels} from './GlobalMoreMenu'

export interface ShellLabels extends MoreMenuLabels { primary: string; home: string; forYou?: string; following?: string; search: string; notifications: string; messages: string; liked?: string; bookmarks: string; profile: string; settings: string; creatorNav: string; creatorCenter?: string; activity?: string; collections?: string; myProfile?: string; expandNavigation?: string; recommendations: string; recommendationsEmpty: string }
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>
type NavItem = {key: keyof Pick<ShellLabels, 'forYou' | 'following' | 'search' | 'notifications' | 'messages' | 'liked' | 'bookmarks' | 'profile' | 'creatorNav' | 'collections'>; href: string; icon: IconComponent}
function CreatorPlusIcon(props: SVGProps<SVGSVGElement>) { return <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}><path d="M12 5v14M5 12h14"/></svg> }
function LikedIcon(props: SVGProps<SVGSVGElement>) { return <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" {...props}><path d="M20.8 8.7c0 5.2-8.8 10.3-8.8 10.3S3.2 13.9 3.2 8.7A4.5 4.5 0 0 1 12 6.5a4.5 4.5 0 0 1 8.8 2.2Z"/></svg> }
function CollectionsIcon(props: SVGProps<SVGSVGElement>) { return <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" {...props}><path d="M12 20s-7-4.1-7-8.5a3.6 3.6 0 0 1 6.6-2 3.6 3.6 0 0 1 6.6 2C18.2 15.9 12 20 12 20Z"/><path d="M17.5 4.5h2v12l-2-1.4-2 1.4v-12h2Z"/></svg> }

export const navItems: ReadonlyArray<NavItem> = [
  {key: 'forYou', href: '', icon: AifansHomeIcon}, {key: 'following', href: '?feed=following', icon: AifansFollowingIcon}, {key: 'search', href: '/search', icon: AifansSearchIcon}, {key: 'messages', href: '/messages', icon: AifansMessageIcon}, {key: 'notifications', href: '/notifications', icon: AifansNotificationIcon}, {key: 'liked', href: '/liked', icon: LikedIcon}, {key: 'bookmarks', href: '/bookmarks', icon: AifansBookmarkIcon}, {key: 'profile', href: '/profile', icon: AifansProfileIcon}, {key: 'creatorNav', href: '/creator', icon: CreatorPlusIcon},
]

function destination(locale: Locale, href: string) { return `/${locale}${href}` }
function NavLink({item, locale, label, compact, following}: {item: NavItem; locale: Locale; label: string; compact?: boolean; following?: boolean | undefined}) {
  const pathname = usePathname(); const href = destination(locale, item.href); const Icon = item.icon
  const active = item.key === 'following' ? pathname === `/${locale}` && following : item.key === 'forYou' ? pathname === href && following === false : item.key === 'messages' ? pathname === href || pathname.startsWith(`${href}/`) || pathname === `/${locale}/notifications` : pathname === href
  return <Link aria-current={active ? 'page' : undefined} aria-label={label} className="nav-link" href={href}><Icon aria-hidden="true" className="nav-icon"/><span className={compact ? 'nav-link-label sr-only' : 'nav-link-label'}>{label}</span></Link>
}
function NavList({items, labels, locale, compact, following}: {items: ReadonlyArray<NavItem>; labels: ShellLabels; locale: Locale; compact: boolean; following?: boolean}) { const label = (key: NavItem['key']) => key === 'forYou' ? labels.forYou ?? labels.home : key === 'following' ? labels.following ?? 'Following' : key === 'liked' ? labels.liked ?? 'Liked' : key === 'collections' ? labels.collections ?? labels.activity ?? labels.bookmarks : key === 'profile' ? labels.myProfile ?? labels.profile : labels[key]; return <div className="nav-list">{items.map((item) => <NavLink compact={compact} following={following} item={item} key={item.key} label={label(item.key)} locale={locale}/>)}</div> }
function QueryAwareNavList(props: Omit<Parameters<typeof NavList>[0], 'following'>) { const search = useSearchParams(); return <NavList {...props} following={search.get('feed') === 'following'}/> }
export function visibleNavItems(_creatorModeEnabled=true) { return navItems.filter((item) => item.key !== 'creatorNav' && item.key !== 'notifications') }
export const mobileNavItems: ReadonlyArray<NavItem> = [
  ...['forYou', 'messages', 'creatorNav'].map((key) => navItems.find((item) => item.key === key)!),
  {key: 'collections', href: '/activity', icon: CollectionsIcon},
  navItems.find((item) => item.key === 'profile')!,
]

export function AppNav({locale, labels, creatorModeEnabled=true, compact=false}: {locale: Locale; labels: ShellLabels; creatorModeEnabled?: boolean; compact?: boolean}) {
  const items = visibleNavItems(creatorModeEnabled)
  return <nav aria-label={labels.primary} className={compact ? 'desktop-nav desktop-nav-compact' : 'desktop-nav'} data-compact={compact ? 'true' : undefined}><div className="nav-sticky"><Link aria-label="AIFANS" className="brand" href={`/${locale}`}><Logo className="brand-logo-full"/><Logo className="brand-logo-compact" showWordmark={false}/></Link><Suspense fallback={<NavList compact={compact} items={items} labels={labels} locale={locale}/> }><QueryAwareNavList compact={compact} items={items} labels={labels} locale={locale}/></Suspense><GlobalMoreMenu labels={labels} locale={locale}/></div></nav>
}
