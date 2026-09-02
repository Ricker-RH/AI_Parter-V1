import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {access, fetchBookmarks} = vi.hoisted(() => ({access: vi.fn(), fetchBookmarks: vi.fn()}))
vi.mock('../../../lib/social-api.js', () => ({fetchBookmarks}))
vi.mock('../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access, redirectToUserSignIn: vi.fn()}))

import BookmarksPage from './page.js'

describe('bookmarks page', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    fetchBookmarks.mockReset().mockResolvedValue({status: 'ok', data: {items: [], nextCursor: null}})
  })

  it('uses the collection feed frame and a real Home recovery action', async () => {
    render(await BookmarksPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))

    expect(screen.getByRole('heading', {name: 'Saved'})).toBeVisible()
    expect(document.querySelector('.collection-page')).toBeTruthy()
    expect(screen.getByRole('link', {name: 'Home'})).toHaveAttribute('href', '/en')
  })
})
