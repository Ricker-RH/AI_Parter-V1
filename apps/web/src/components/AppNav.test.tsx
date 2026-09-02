import {render, screen} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {describe, expect, it, vi} from 'vitest'
import {AppNav} from './AppNav.js'
import en from '../../messages/en.json'
import zhCN from '../../messages/zh-CN.json'

const {search, pathname} = vi.hoisted(() => ({search: new URLSearchParams(), pathname: {value: '/en'}}))
vi.mock('next/navigation', () => ({usePathname: () => pathname.value, useSearchParams: () => search}))
vi.mock('next/link', () => ({default: ({children, ...props}: {children: React.ReactNode; [key: string]: unknown}) => <a {...props}>{children}</a>}))

const labels = en

describe('AppNav', () => {
  it('keeps Home feed choices in the desktop sidebar without a human composer', () => {
    render(<AppNav labels={labels} locale="en" />)

    expect(screen.getByRole('link', {name: 'For You'})).toHaveAttribute('href', '/en')
    expect(screen.getByRole('link', {name: 'Following'})).toHaveAttribute('href', '/en?feed=following')
    expect(screen.queryByRole('button', {name: /post|compose|publish/i})).toBeNull()
    expect(screen.queryByRole('link', {name: 'Settings'})).toBeNull()
  })

  it('keeps the ordinary desktop order and excludes Creator Center', () => {
    render(<AppNav labels={labels} locale="en" />)
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'AIFANS', 'For You', 'Following', 'Search', 'Messages', 'Liked', 'Saved', 'My Profile',
    ])
    expect(screen.queryByRole('link', {name: 'Creator Center'})).toBeNull()
  })

  it.each([
    ['en', en, en.myProfile],
    ['zh-CN', zhCN, zhCN.myProfile],
  ] as const)('uses the localized my-profile label from %s messages', (locale, messages, profileLabel) => {
    render(<AppNav labels={messages} locale={locale} />)
    expect(screen.getByRole('link', {name: profileLabel})).toHaveAttribute('href', `/${locale}/profile`)
  })

  it('marks only Following active for a following query and exposes rail labels', () => {
    search.set('feed', 'following')
    render(<AppNav compact labels={labels} locale="en" />)
    expect(screen.getByRole('link', {name: 'Following'})).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', {name: 'For You'})).not.toHaveAttribute('aria-current')
    search.delete('feed')
  })

  it('provides separate full and compact logo variants for responsive CSS', () => {
    const {container} = render(<AppNav labels={labels} locale="en" />)
    expect(container.querySelector('.brand-logo-full')).toBeTruthy()
    expect(container.querySelector('.brand-logo-compact')).toBeTruthy()
  })

  it('marks Messages navigation as permanently compact for CSS contracts', () => {
    const {container} = render(<AppNav compact labels={labels} locale="en" />)
    expect(container.querySelector('.desktop-nav-compact[data-compact="true"]')).toBeTruthy()
  })

  it('keeps Messages selected throughout a conversation detail route', () => {
    pathname.value = '/en/messages/11111111-1111-4111-8111-111111111111'
    render(<AppNav compact labels={labels} locale="en" />)
    expect(screen.getByRole('link', {name: 'Messages'})).toHaveAttribute('aria-current', 'page')
    pathname.value = '/en'
  })

  it('groups Notifications under the Messages destination', () => {
    pathname.value = '/en/notifications'
    render(<AppNav compact labels={labels} locale="en" />)
    expect(screen.getByRole('link', {name: 'Messages'})).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', {name: 'Notifications'})).toBeNull()
    pathname.value = '/en'
  })

  it('keeps expanded labels available for the compact rail at desktop widths', () => {
    const css = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css', 'utf8')
    expect(css).toContain('.desktop-nav-compact[data-expanded] .nav-link-label')
  })

  it('keeps query-aware navigation within an explicit Suspense boundary', () => {
    const source = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/AppNav.tsx' : 'apps/web/src/components/AppNav.tsx', 'utf8')
    expect(source).toContain('<Suspense')
  })
})
