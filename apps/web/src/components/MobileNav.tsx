'use client'

import type {Locale} from '../i18n/config'
import {visibleNavItems, type ShellLabels} from './AppNav'
import {usePathname} from 'next/navigation'
import Link from 'next/link'
import {useState} from 'react'

export function MobileNav({locale, labels,creatorModeEnabled=true}: {locale: Locale; labels: ShellLabels;creatorModeEnabled?:boolean}) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const items=visibleNavItems(creatorModeEnabled)
  const mobileItems = items.slice(0, 4)
  const moreItems = items.slice(4)
  return <nav aria-label={labels.primary} className="mobile-nav">{mobileItems.map((item) => {
    const href = `/${locale}${item.href}`
    const Icon = item.icon
    return <Link aria-current={pathname === href ? 'page' : undefined} className="mobile-link" href={href} key={item.key}><Icon aria-hidden="true" className="nav-icon" />{labels[item.key]}</Link>
  })}<button aria-controls="mobile-more-menu" aria-expanded={moreOpen} className="mobile-link mobile-more-toggle" onClick={() => setMoreOpen((open) => !open)} type="button">{labels.more}</button>{moreOpen ? <div className="mobile-more-menu" id="mobile-more-menu">{moreItems.map((item) => { const href = `/${locale}${item.href}`; const Icon = item.icon; return <Link aria-current={pathname === href ? 'page' : undefined} className="mobile-more-item" href={href} key={item.key} onClick={() => setMoreOpen(false)}><Icon aria-hidden="true" className="nav-icon" />{labels[item.key]}</Link> })}</div> : null}</nav>
}
