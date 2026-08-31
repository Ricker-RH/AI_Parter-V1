import type {ReactElement, ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'

vi.mock('next/navigation', () => ({notFound: vi.fn()}))
vi.mock('../../lib/request-cookie.js', () => ({requestCookie: vi.fn()}))
vi.mock('../../lib/current-account.js', () => ({fetchCurrentAccount: vi.fn()}))
vi.mock('../../lib/analytics/provider.js', () => ({AnalyticsProvider: ({children, profileId}: {children: ReactNode; profileId?: string | null}) => <div data-profile-id={profileId ?? ''}>{children}</div>}))

import LocaleLayout from './layout.js'
import {fetchCurrentAccount} from '../../lib/current-account.js'
import {requestCookie} from '../../lib/request-cookie.js'

const account = {id: '11111111-1111-4111-8111-111111111111', kind: 'human' as const, username: 'aifans_user', displayName: 'AIFANS User', preferredLocale: 'en' as const, creatorModeEnabled: false}

function analyticsProps(tree: ReactElement) {
  const html = tree as ReactElement<{children: ReactElement<{children: ReactElement<{profileId?: string | null}>}>}>
  return html.props.children.props.children.props
}

describe('locale layout analytics identity', () => {
  it('fetches the server current account and passes only its AIFANS profile UUID to the provider', async () => {
    vi.mocked(requestCookie).mockResolvedValue('session=real')
    vi.mocked(fetchCurrentAccount).mockResolvedValue(account)
    const tree = await LocaleLayout({children: <main>Content</main>, params: Promise.resolve({locale: 'en'})})
    expect(fetchCurrentAccount).toHaveBeenCalledWith({cookie: 'session=real'})
    expect(analyticsProps(tree).profileId).toBe(account.id)
    expect(analyticsProps(tree).profileId).not.toContain('session')
  })

  it('treats a missing current account as signed out', async () => {
    vi.mocked(requestCookie).mockResolvedValue(undefined)
    vi.mocked(fetchCurrentAccount).mockResolvedValue(null)
    const tree = await LocaleLayout({children: <main>Signed out</main>, params: Promise.resolve({locale: 'en'})})
    expect(analyticsProps(tree).profileId).toBeNull()
  })
})
