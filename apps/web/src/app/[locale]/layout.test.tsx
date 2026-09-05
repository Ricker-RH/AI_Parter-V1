import type {ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'

const {rootLocale} = vi.hoisted(() => ({rootLocale: vi.fn(async () => 'en')}))
vi.mock('next/navigation', () => ({notFound: vi.fn()}))
vi.mock('next/root-params', () => ({locale: rootLocale}))
vi.mock('../../lib/request-cookie.js', () => ({requestCookie: vi.fn()}))
vi.mock('../../lib/current-account.js', () => ({fetchCurrentAccount: vi.fn()}))
vi.mock('../../lib/analytics/provider.js', () => ({AnalyticsProvider: ({children, profileId}: {children: ReactNode; profileId?: string | null}) => <div data-profile-id={profileId ?? ''}>{children}</div>}))

import LocaleLayout, {ROOT_LOCALE_SCRIPT} from './layout.js'
import {resolveShellKind} from '../../components/shell/route-shell.js'
import {fetchCurrentAccount} from '../../lib/current-account.js'
import {requestCookie} from '../../lib/request-cookie.js'

describe('locale layout analytics identity', () => {
  it('mounts the account provider inside the server locale layout', () => {
    const source = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/[locale]/layout.tsx' : 'apps/web/src/app/[locale]/layout.tsx', 'utf8')
    expect(source).toContain('CurrentAccountProvider')
    expect(source).not.toMatch(/^['"]use client['"]/)
  })

  it('returns the root shell without waiting for locale or analytics-only account data', async () => {
    rootLocale.mockReturnValue(new Promise(() => undefined))
    vi.mocked(requestCookie).mockResolvedValue('session=real')
    vi.mocked(fetchCurrentAccount).mockReturnValue(new Promise(() => undefined))
    expect(LocaleLayout({children: <main>Content</main>})).toBeDefined()
    expect(rootLocale).not.toHaveBeenCalled()
    expect(requestCookie).not.toHaveBeenCalled()
    expect(fetchCurrentAccount).not.toHaveBeenCalled()
  })

  it.each([
    ['/zh-CN/feed', 'zh-CN'],
    ['/en/feed', 'en'],
    ['/fr/feed', 'en'],
    ['/zh-CN-evil/feed', 'en'],
  ])('maps a hard-navigation pathname %s to the whitelisted lang %s', (pathname, expected) => {
    window.history.replaceState({}, '', pathname)
    window.eval(ROOT_LOCALE_SCRIPT)
    expect(document.documentElement.lang).toBe(expected)
  })

  it.each([
    '/en',
    '/zh-CN/search',
    '/en/admin',
    '/zh-CN/admin/creator',
    '/en/auth/sign-in',
    '/zh-CN/messages/thread-1',
    '/en/notifications',
    '/zh-CN/creator/draft-1',
    '/fr/admin',
  ])('prepaints the same route shell as resolveShellKind for %s', (pathname) => {
    window.history.replaceState({}, '', pathname)
    window.eval(ROOT_LOCALE_SCRIPT)
    expect(document.documentElement.dataset.routeShell).toBe(resolveShellKind(pathname))
  })
})

 it.each([['/en/profile', 'true'], ['/zh-CN/humans/person', 'true'], ['/en', 'false'], ['/en/profile/edit', 'false']])('prepaints cover route %s', (pathname, expected) => {
   window.history.replaceState({}, '', pathname)
   window.eval(ROOT_LOCALE_SCRIPT)
   expect(document.documentElement.dataset.profileRoute).toBe(expected)
 })
