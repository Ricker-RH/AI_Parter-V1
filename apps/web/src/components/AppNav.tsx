'use client'

import {AifansBookmarkIcon, AifansFollowingIcon, AifansHomeIcon, AifansMessageIcon, AifansNotificationIcon, AifansProfileIcon, AifansSearchIcon, Logo} from '@aifans/ui'
import Link from 'next/link'
import {usePathname, useSearchParams} from 'next/navigation'
import {Suspense} from 'react'
import type {ComponentType, SVGProps} from 'react'
import type {Locale} from '../i18n/config'
import {GlobalMoreMenu, type MoreMenuLabels} from './GlobalMoreMenu'
import {isNavigationActive} from './navigation-active'

export interface ShellLabels extends MoreMenuLabels { primary: string; home: string; channels?: string; forYou?: string; following?: string; search: string; notifications: string; messages: string; liked?: string; bookmarks: string; profile: string; settings: string; creatorNav: string; creatorCenter?: string; activity?: string; collections?: string; myNav?: string; myProfile?: string; expandNavigation?: string; recommendations: string; recommendationsEmpty: string }
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>
type NavItem = {key: keyof Pick<ShellLabels, 'forYou' | 'following' | 'search' | 'channels' | 'notifications' | 'messages' | 'liked' | 'bookmarks' | 'profile'>; href: string; icon: IconComponent}
function LikedIcon(props: SVGProps<SVGSVGElement>) { return <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" {...props}><path d="M20.8 8.7c0 5.2-8.8 10.3-8.8 10.3S3.2 13.9 3.2 8.7A4.5 4.5 0 0 1 12 6.5a4.5 4.5 0 0 1 8.8 2.2Z"/></svg> }
function ChannelsIcon(props: SVGProps<SVGSVGElement>) { return <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" {...props}><path d="M4 5.5h16M4 12h16M4 18.5h16"/><circle cx="8" cy="5.5" fill="currentColor" r="1" stroke="none"/><circle cx="16" cy="12" fill="currentColor" r="1" stroke="none"/><circle cx="10" cy="18.5" fill="currentColor" r="1" stroke="none"/></svg> }

export const navItems: ReadonlyArray<NavItem> = [
  {key: 'forYou', href: '', icon: AifansHomeIcon}, {key: 'following', href: '?feed=following', icon: AifansFollowingIcon}, {key: 'search', href: '/search', icon: AifansSearchIcon}, {key: 'channels', href: '/channels', icon: ChannelsIcon}, {key: 'messages', href: '/messages', icon: AifansMessageIcon}, {key: 'notifications', href: '/notifications', icon: AifansNotificationIcon}, {key: 'liked', href: '/liked', icon: LikedIcon}, {key: 'bookmarks', href: '/bookmarks', icon: AifansBookmarkIcon}, {key: 'profile', href: '/profile', icon: AifansProfileIcon},
]

function destination(locale: Locale, href: string) { return `/${locale}${href}` }
function NavLinkView({active, item, locale, label, compact}: {active: boolean; item: NavItem; locale: Locale; label: string; compact?: boolean}) {
  const href = destination(locale, item.href); const Icon = item.icon
  return <Link aria-current={active ? 'page' : undefined} aria-label={label} className="nav-link" href={href}><Icon aria-hidden="true" className="nav-icon"/><span className={compact ? 'nav-link-label sr-only' : 'nav-link-label'}>{label}</span></Link>
}
function NavLink({item, locale, label, compact, following}: {item: NavItem; locale: Locale; label: string; compact?: boolean; following?: boolean | undefined}) {
  const pathname = usePathname()
  return <NavLinkView active={isNavigationActive(item, locale, pathname, following)} {...(compact === undefined ? {} : {compact})} item={item} label={label} locale={locale}/>
}
function labelFor(labels: ShellLabels, key: NavItem['key']) {
  return key === 'forYou' ? labels.forYou ?? labels.home : key === 'following' ? labels.following ?? 'Following' : key === 'channels' ? labels.channels ?? 'Channels' : key === 'liked' ? labels.liked ?? 'Liked' : key === 'profile' ? labels.myProfile ?? labels.profile : labels[key]
}
function NavList({items, labels, locale, compact, following}: {items: ReadonlyArray<NavItem>; labels: ShellLabels; locale: Locale; compact: boolean; following?: boolean}) {
  return <div className="nav-list">{items.map((item) => <NavLink compact={compact} following={following} item={item} key={item.key} label={labelFor(labels, item.key)} locale={locale}/>)}</div>
}
function StaticNavList({items, labels, locale, compact}: {items: ReadonlyArray<NavItem>; labels: ShellLabels; locale: Locale; compact: boolean}) {
  return <div className="nav-list">{items.map((item) => <NavLinkView active={false} compact={compact} item={item} key={item.key} label={labelFor(labels, item.key)} locale={locale}/>)}</div>
}
function QueryAwareNavList(props: Omit<Parameters<typeof NavList>[0], 'following'>) { const search = useSearchParams(); return <NavList {...props} following={search.get('feed') === 'following'}/> }
export function visibleNavItems() { return navItems.filter((item) => item.key !== 'notifications') }
export const mobileNavItems: ReadonlyArray<NavItem> = [
  ...['forYou', 'channels', 'messages', 'profile'].map((key) => navItems.find((item) => item.key === key)!),
]

export function AppNav({locale, labels, compact=false}: {locale: Locale; labels: ShellLabels; compact?: boolean}) {
  const items = visibleNavItems()
  return <nav aria-label={labels.primary} className={compact ? 'desktop-nav desktop-nav-compact' : 'desktop-nav'} data-compact={compact ? 'true' : undefined}><div className="nav-sticky"><Link aria-label="AIFANS" className="brand" href={`/${locale}`}><Logo className="brand-logo-full"/><Logo className="brand-logo-compact" showWordmark={false}/></Link><Suspense fallback={<StaticNavList compact={compact} items={items} labels={labels} locale={locale}/> }><QueryAwareNavList compact={compact} items={items} labels={labels} locale={locale}/></Suspense><GlobalMoreMenu labels={labels} locale={locale}/></div></nav>
}
