import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {fetchSearch} = vi.hoisted(() => ({fetchSearch: vi.fn()}))
vi.mock('../../../lib/social-api.js', () => ({fetchSearch}))

import SearchPage from './page.js'

const profile = {
  kind: 'ip' as const,
  id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
  username: 'luna_ip',
  displayName: 'Luna',
  languages: ['en' as const],
  visualType: 'anime' as const,
}

describe('public search page', () => {
  beforeEach(() => fetchSearch.mockReset())

  it('renders an anonymous search form without requesting an empty query', async () => {
    render(await SearchPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))
    expect(screen.getByRole('search')).toBeVisible()
    expect(screen.getByRole('searchbox', {name: 'Search'})).toBeVisible()
    expect(fetchSearch).not.toHaveBeenCalled()
  })

  it('requests normalized query results and renders public profiles', async () => {
    fetchSearch.mockResolvedValue({status: 'ok', data: {items: [{type: 'profile', profile}], nextCursor: null}})
    render(await SearchPage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({q: '  luna  ', category: 'ips'}),
    }))
    expect(fetchSearch).toHaveBeenCalledWith(expect.objectContaining({q: 'luna', category: 'ips'}))
    expect(screen.getByText('Luna')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Follow'})).toBeNull()
  })

  it('renders the no-results state', async () => {
    fetchSearch.mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
    render(await SearchPage({
      params: Promise.resolve({locale: 'en'}),
      searchParams: Promise.resolve({q: 'unknown'}),
    }))
    expect(screen.getByText('No results found')).toBeVisible()
  })
})
