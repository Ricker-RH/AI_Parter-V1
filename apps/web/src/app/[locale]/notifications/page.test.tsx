import {beforeEach, describe, expect, it, vi} from 'vitest'

const {redirect, notFound} = vi.hoisted(() => ({redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }), notFound: vi.fn(() => { throw new Error('NOT_FOUND') })}))
vi.mock('next/navigation', () => ({notFound, redirect}))
import NotificationsPage from './page.js'

describe('legacy notifications route', () => {
  beforeEach(() => { redirect.mockClear(); notFound.mockClear() })

  it('redirects to the canonical workspace route', async () => {
    await expect(NotificationsPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})})).rejects.toThrow('REDIRECT:/en/messages/notifications')
  })

  it('preserves one cursor and drops duplicate cursor values', async () => {
    await expect(NotificationsPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({cursor: 'next page'})})).rejects.toThrow('REDIRECT:/en/messages/notifications?cursor=next+page')
    await expect(NotificationsPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({cursor: ['first', 'second']})})).rejects.toThrow('REDIRECT:/en/messages/notifications')
  })
})
