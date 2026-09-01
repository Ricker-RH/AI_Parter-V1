import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {access, redirect, authRedirect, currentAccount, fetchBookmarks, fetchNotifications, fetchPost, fetchPublicProfile, fetchAifansApi} = vi.hoisted(() => ({
  access: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
  authRedirect: vi.fn(({locale, returnTo}: {locale: string; returnTo: string}) => { throw new Error(`REDIRECT:/${locale}/auth/sign-in?next=${encodeURIComponent(returnTo)}`) }),
  currentAccount: vi.fn(async () => ({status: 'anonymous'})),
  fetchBookmarks: vi.fn(async () => ({status: 'unavailable'})),
  fetchNotifications: vi.fn(async () => ({status: 'unavailable'})),
  fetchPost: vi.fn(async () => ({status: 'unavailable'})),
  fetchPublicProfile: vi.fn(async () => ({status: 'unavailable'})),
  fetchAifansApi: vi.fn(async () => new Response(null, {status: 503})),
}))

vi.mock('next/navigation', () => ({notFound: vi.fn(() => { throw new Error('NOT_FOUND') }), redirect}))
vi.mock('../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access, redirectToUserSignIn: authRedirect}))
vi.mock('../lib/request-cookie.js', () => ({requestCookie: vi.fn(async () => undefined)}))
vi.mock('../lib/current-account.js', () => ({fetchCurrentAccountResult: currentAccount}))
vi.mock('../lib/social-api.js', () => ({fetchBookmarks, fetchNotifications, fetchPost, fetchPublicProfile}))
vi.mock('../lib/server-api.js', () => ({fetchAifansApi}))

import BookmarksPage from './[locale]/bookmarks/page.js'
import CreatorDraftPage from './[locale]/creator/[draftId]/page.js'
import CreatorPage from './[locale]/creator/page.js'
import NotificationsPage from './[locale]/notifications/page.js'
import PostPage from './[locale]/posts/[postId]/page.js'
import ProfilePage from './[locale]/profile/page.js'
import PublicProfilePage from './[locale]/profiles/[profileId]/page.js'
import SearchPage from './[locale]/search/page.js'

const draftId = '11111111-1111-4111-8111-111111111111'

describe('protected user pages', () => {
  beforeEach(() => {
    process.env.CREATOR_MODE_ENABLED = 'true'
    access.mockReset().mockResolvedValue({status: 'unavailable'})
    currentAccount.mockReset().mockResolvedValue({status: 'anonymous'})
    for (const fn of [fetchBookmarks, fetchNotifications, fetchPost, fetchPublicProfile]) fn.mockReset().mockResolvedValue({status: 'unavailable'})
    fetchAifansApi.mockReset().mockResolvedValue(new Response(null, {status: 503}))
  })

  afterEach(() => { delete process.env.CREATOR_MODE_ENABLED })

  it.each([
    ['search', () => SearchPage({params: Promise.resolve({locale: 'en'})}), '/en/search'],
    ['bookmarks', () => BookmarksPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}), '/en/bookmarks'],
    ['notifications', () => NotificationsPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}), '/en/notifications'],
    ['my profile', () => ProfilePage({params: Promise.resolve({locale: 'en'})}), '/en/profile'],
    ['post detail', () => PostPage({params: Promise.resolve({locale: 'en', postId: 'post-1'}), searchParams: Promise.resolve({})}), '/en/posts/post-1'],
    ['AI/IP profile detail', () => PublicProfilePage({params: Promise.resolve({locale: 'en', profileId: 'profile-1'}), searchParams: Promise.resolve({})}), '/en/profiles/profile-1'],
    ['creator root', () => CreatorPage({params: Promise.resolve({locale: 'en'})}), '/en/creator'],
    ['creator draft', () => CreatorDraftPage({params: Promise.resolve({locale: 'en', draftId})}), `/en/creator/${draftId}`],
  ])('checks access before %s can reach its data source', async (_name, page, returnTo) => {
    await page()

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo})
    expect(fetchBookmarks).not.toHaveBeenCalled()
    expect(fetchNotifications).not.toHaveBeenCalled()
    expect(fetchPost).not.toHaveBeenCalled()
    expect(fetchPublicProfile).not.toHaveBeenCalled()
    expect(fetchAifansApi).not.toHaveBeenCalled()
  })

  it.each([
    ['bookmarks', () => BookmarksPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}), fetchBookmarks, '/en/bookmarks'],
    ['notifications', () => NotificationsPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}), fetchNotifications, '/en/notifications'],
    ['post detail', () => PostPage({params: Promise.resolve({locale: 'en', postId: 'post-1'}), searchParams: Promise.resolve({})}), fetchPost, '/en/posts/post-1'],
    ['AI/IP profile detail', () => PublicProfilePage({params: Promise.resolve({locale: 'en', profileId: 'profile-1'}), searchParams: Promise.resolve({})}), fetchPublicProfile, '/en/profiles/profile-1'],
  ])('redirects to sign in when %s receives a 401 result', async (_name, page, fetchPage, returnTo) => {
    access.mockResolvedValue({status: 'authenticated', token: 'token'})
    fetchPage.mockResolvedValue({status: 'auth-required'})

    await expect(page()).rejects.toThrow(`REDIRECT:/en/auth/sign-in?next=${encodeURIComponent(returnTo)}`)
  })

  it.each([
    ['bookmarks', () => BookmarksPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}), fetchBookmarks],
    ['notifications', () => NotificationsPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}), fetchNotifications],
    ['post detail', () => PostPage({params: Promise.resolve({locale: 'en', postId: 'post-1'}), searchParams: Promise.resolve({})}), fetchPost],
    ['AI/IP profile detail', () => PublicProfilePage({params: Promise.resolve({locale: 'en', profileId: 'profile-1'}), searchParams: Promise.resolve({})}), fetchPublicProfile],
  ])('reuses the guarded token for the %s data request', async (_name, page, fetchPage) => {
    access.mockResolvedValue({status: 'authenticated', token: 'token'})

    await page()

    expect(fetchPage.mock.calls[0]?.at(-1)).toEqual(expect.objectContaining({token: 'token'}))
  })

  it('redirects post detail when its current-account request returns 401', async () => {
    access.mockResolvedValue({status: 'authenticated', token: 'token'})
    currentAccount.mockResolvedValue({status: 'auth-required'})

    await expect(PostPage({params: Promise.resolve({locale: 'en', postId: 'post-1'}), searchParams: Promise.resolve({})}))
      .rejects.toThrow(`REDIRECT:/en/auth/sign-in?next=${encodeURIComponent('/en/posts/post-1')}`)
  })

  it('redirects the creator draft page when its API request returns 401', async () => {
    access.mockResolvedValue({status: 'authenticated', token: 'token'})
    fetchAifansApi.mockResolvedValue(new Response(null, {status: 401}))

    await expect(CreatorDraftPage({params: Promise.resolve({locale: 'en', draftId})}))
      .rejects.toThrow(`REDIRECT:/en/auth/sign-in?next=${encodeURIComponent(`/en/creator/${draftId}`)}`)
    expect(fetchAifansApi).toHaveBeenCalledWith(`/v1/creator/drafts/${draftId}`,expect.objectContaining({getToken:expect.any(Function)}))
  })
})
