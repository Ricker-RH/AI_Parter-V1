import {fireEvent, render, screen} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {describe, expect, it, vi} from 'vitest'
import {MobileNav} from './MobileNav.js'
import en from '../../messages/en.json'
import zhCN from '../../messages/zh-CN.json'

const {pathname, suspendPathname} = vi.hoisted(() => ({pathname: {value: '/en'}, suspendPathname: {value: false}}))
vi.mock('next/navigation', () => ({usePathname: () => { if (suspendPathname.value) throw new Promise(() => undefined); return pathname.value }}))
vi.mock('next/link', () => ({default: ({children, prefetch, ...props}: {children: React.ReactNode; prefetch?: boolean | null; [key: string]: unknown}) => <a {...props} data-prefetch={prefetch === false ? 'false' : 'shell'}>{children}</a>}))

const labels = en

describe('MobileNav', () => {
  it('uses the strict four-destination mobile order', () => {
    render(<MobileNav labels={labels} locale="en" />)

    expect(screen.getAllByRole('link').map((link) => link.getAttribute('aria-label')))
      .toEqual(['Home', 'Channels', 'Messages', 'Me'])
    expect(screen.queryByRole('link', {name: 'Creator Center'})).toBeNull()
    expect(screen.queryByRole('link', {name: 'Collections'})).toBeNull()
  })

  it('leaves each visible mobile destination eligible for the shared App Shell prefetch', () => {
    render(<MobileNav labels={labels} locale="en" />)

    expect(screen.getAllByRole('link').map((link) => link.getAttribute('data-prefetch')))
      .toEqual(['shell', 'shell', 'shell', 'shell'])
  })

  it('stays at four destinations without a creator-mode navigation prop', () => {
    const {container} = render(<MobileNav labels={labels} locale="en" />)
    expect(screen.queryByRole('link', {name: en.creatorCenter})).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(4)
    expect(container.querySelector('.mobile-nav')).toHaveAttribute('data-count', '4')
    const root = process.cwd().endsWith('/apps/web') ? 'src/components' : 'apps/web/src/components'
    for (const file of ['AppNav.tsx', 'MobileNav.tsx', 'shell/PublicShell.tsx', 'shell/MessagesShell.tsx']) {
      expect(readFileSync(`${root}/${file}`, 'utf8')).not.toContain('creatorModeEnabled')
    }
  })

  it('marks Channels as the active destination on a channel detail route', () => {
    pathname.value = '/en/channels/future-city'
    render(<MobileNav labels={labels} locale="en" />)
    expect(screen.getByRole('link', {name: 'Channels'})).toHaveAttribute('href', '/en/channels')
    expect(screen.getByRole('link', {name: 'Channels'})).toHaveAttribute('aria-current', 'page')
    pathname.value = '/en'
  })

  it('keeps Messages selected on a conversation detail route', () => {
    pathname.value = '/en/messages/11111111-1111-4111-8111-111111111111'
    render(<MobileNav labels={labels} locale="en" />)
    expect(screen.getByRole('link', {name: 'Messages'})).toHaveAttribute('aria-current', 'page')
    pathname.value = '/en'
  })

  it('groups Notifications under the Messages destination', () => {
    pathname.value = '/en/notifications'
    render(<MobileNav labels={labels} locale="en" />)
    expect(screen.getByRole('link', {name: 'Messages'})).toHaveAttribute('aria-current', 'page')
    pathname.value = '/en'
  })

  it('renders complete static links when pathname resolution suspends', () => {
    suspendPathname.value = true
    render(<MobileNav labels={labels} locale="en" />)
    expect(screen.getByRole('link', {name: 'Home'})).toHaveAttribute('href', '/en')
    expect(screen.getByRole('link', {name: 'Channels'})).toHaveAttribute('href', '/en/channels')
    suspendPathname.value = false
  })

  it('localizes all four destinations for zh-CN', () => {
    pathname.value = '/zh-CN/channels'
    render(<MobileNav labels={zhCN} locale="zh-CN" />)
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('aria-label')))
      .toEqual(['首页', '频道', '消息', '我的'])
    expect(screen.getByRole('link', {name: '频道'})).toHaveAttribute('aria-current', 'page')
    pathname.value = '/en'
  })
})
