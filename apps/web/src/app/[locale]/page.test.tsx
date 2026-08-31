import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

vi.mock('../../lib/request-cookie.js', () => ({requestCookie: vi.fn(async () => undefined)}))
vi.mock('../../lib/social-api.js', () => ({
  fetchFeed: vi.fn(async () => ({status: 'ok', data: {items: [], nextCursor: null}})),
}))

import HomePage from './page.js'

describe('home feed query navigation', () => {
  it('preserves repeated parameters and removes the stale cursor from tab links', async () => {
    render(await HomePage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({
        campaign: ['launch', 'return'],
        cursor: 'stale',
        visualType: 'anime',
      }),
    }))

    expect(screen.getByRole('tab', {name: 'Following'})).toHaveAttribute(
      'href',
      '/en?campaign=launch&campaign=return&visualType=anime&feed=following',
    )
    expect(screen.getByRole('tab', {name: 'Realistic'})).toHaveAttribute(
      'href',
      '/en?campaign=launch&campaign=return&visualType=realistic',
    )
    expect(screen.getAllByRole('tab').every((tab) => !tab.getAttribute('href')?.includes('cursor='))).toBe(true)
  })
})
