import type {ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'

vi.mock('next/navigation', () => ({notFound: vi.fn()}))
vi.mock('../../lib/request-cookie.js', () => ({requestCookie: vi.fn()}))
vi.mock('../../lib/current-account.js', () => ({fetchCurrentAccount: vi.fn()}))
vi.mock('../../lib/analytics/provider.js', () => ({AnalyticsProvider: ({children, profileId}: {children: ReactNode; profileId?: string | null}) => <div data-profile-id={profileId ?? ''}>{children}</div>}))

import LocaleLayout, {instant} from './layout.js'
import {fetchCurrentAccount} from '../../lib/current-account.js'
import {requestCookie} from '../../lib/request-cookie.js'

describe('locale layout analytics identity', () => {
  it('explicitly keeps unmigrated locale routes non-instant', () => {
    expect(instant).toBe(false)
  })

  it('renders without waiting for an analytics-only current-account request', async () => {
    vi.mocked(requestCookie).mockResolvedValue('session=real')
    vi.mocked(fetchCurrentAccount).mockReturnValue(new Promise(() => undefined))
    await expect(LocaleLayout({children: <main>Content</main>, params: Promise.resolve({locale: 'en'})})).resolves.toBeDefined()
    expect(requestCookie).not.toHaveBeenCalled()
    expect(fetchCurrentAccount).not.toHaveBeenCalled()
  })
})
