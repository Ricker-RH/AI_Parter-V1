import {render, screen, within} from '@testing-library/react'
import type {FeedPage} from '@aifans/contracts'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {SocialApiResult} from '../../lib/social-api.js'

const {access, optionalAccess, authRedirect, fetchFeed, rootLocale} = vi.hoisted(() => ({access: vi.fn(), optionalAccess: vi.fn(), authRedirect: vi.fn(), fetchFeed: vi.fn(async () => ({status: 'ok', data: {items: [], nextCursor: null}})), rootLocale: vi.fn(async () => 'en')}))
vi.mock('next/root-params', () => ({locale: rootLocale}))
vi.mock('../../lib/request-cookie.js', () => ({requestCookie: vi.fn(async () => undefined)}))
vi.mock('../../lib/social-api.js', () => ({
  fetchFeed,
}))
vi.mock('../../lib/auth/access-policy.js', () => ({getOptionalPageAccess: optionalAccess, requireAuthenticatedPage: access, redirectToUserSignIn: authRedirect}))

import {getMessages} from '../../i18n/config.js'
import HomePage, {HomeQueryContent, LocalizedHomePage, PublicForYouFeed} from './page.js'

async function resolvedHome(searchParams: Record<string, string | string[] | undefined>, locale: 'en' | 'zh-CN' = 'en') {
  return HomeQueryContent({locale, messages: await getMessages(locale), searchParams: Promise.resolve(searchParams)})
}

describe('home feed query navigation', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    optionalAccess.mockReset().mockResolvedValue({status: 'anonymous'})
    authRedirect.mockReset()
    fetchFeed.mockClear()
    rootLocale.mockReset().mockResolvedValue('en')
  })
  it('preserves repeated parameters and removes legacy visual filters and stale cursors from tab links', async () => {
    render(await resolvedHome({
        campaign: ['launch', 'return'],
        cursor: 'stale',
        visualType: 'anime',
      }))

    const feedNavigation = screen.getByRole('navigation', {name: 'Home'})
    expect(within(feedNavigation).getByRole('link', {name: 'Following'})).toHaveAttribute('href', '/en?campaign=launch&campaign=return&feed=following')
    expect(screen.queryByText('Anime')).toBeNull()
    expect(within(feedNavigation).getAllByRole('link').every((link) => !link.getAttribute('href')?.includes('cursor='))).toBe(true)
    expect(within(feedNavigation).getAllByRole('link').every((link) => !link.getAttribute('href')?.includes('visualType='))).toBe(true)
  })

  it('ignores a legacy visualType query and fetches the unfiltered feed', async () => {
    await resolvedHome({visualType: 'hybrid'})

    expect(fetchFeed).toHaveBeenCalledWith({kind: 'for_you', locale: 'en'})
  })

  it('guards Following before it requests a personalized feed', async () => {
    access.mockResolvedValue({status: 'unavailable'})

    await resolvedHome({feed: 'following', visualType: 'anime'})

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en?feed=following'})
    expect(fetchFeed).not.toHaveBeenCalled()
  })

  it('redirects to sign in when the following feed invalidates a previously valid session', async () => {
    fetchFeed.mockResolvedValue({status: 'auth-required'} as never)

    await resolvedHome({feed: 'following'})

    await vi.waitFor(() => expect(authRedirect).toHaveBeenCalledWith({locale: 'en', returnTo: '/en?feed=following'}))
  })

  it('reuses the guarded token for Following while anonymous For You still fetches normally', async () => {
    await resolvedHome({feed: 'following'})
    expect(fetchFeed).toHaveBeenLastCalledWith(expect.objectContaining({kind: 'following', token: 'token'}))

    fetchFeed.mockClear()
    access.mockClear()
    access.mockResolvedValue({status: 'unavailable'})
    await resolvedHome({})
    expect(fetchFeed).toHaveBeenCalledWith(expect.objectContaining({kind: 'for_you'}))
    expect(access).not.toHaveBeenCalled()
  })

  it('passes anonymous For You relationship projections as read-only capabilities', async () => {
    render(await resolvedHome({}))

    expect(optionalAccess).toHaveBeenCalledOnce()
    expect(fetchFeed).toHaveBeenCalledWith(expect.objectContaining({kind: 'for_you'}))
    expect(screen.queryByRole('button', {name: 'Like'})).toBeNull()
    expect(screen.getByRole('heading', {name: 'For You'})).toHaveClass('home-title')
    expect(screen.getByRole('navigation', {name: 'Home'})).toHaveClass('mobile-feed-tabs')
    const surface = document.querySelector('[data-social-surface]')
    const viewport = document.querySelector('[data-social-surface-viewport]')
    expect(surface).toContainElement(screen.getByRole('heading', {name: 'For You'}))
    expect(viewport).not.toContainElement(screen.getByRole('heading', {name: 'For You'}))
  })

  it('returns the Home shell without waiting for optional authentication or feed data', async () => {
    optionalAccess.mockReturnValue(new Promise(() => undefined))
    fetchFeed.mockReturnValue(new Promise(() => undefined))

    const page = await Promise.race([
      resolvedHome({}),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 25)),
    ])

    expect(page).not.toBe('timed-out')
    if (page === 'timed-out') return
    render(page)
    expect(screen.getByRole('heading', {name: 'For You'})).toBeVisible()
    expect(document.querySelector('[data-social-surface-viewport]')).toContainElement(document.querySelector('[data-home-feed-fallback]'))
  })

  it('returns a localized Home shell without waiting for search parameters', async () => {
    rootLocale.mockResolvedValue('zh-CN')
    const page = await Promise.race([
      LocalizedHomePage({searchParams: new Promise(() => undefined)}),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 25)),
    ])

    expect(page).not.toBe('timed-out')
    if (page === 'timed-out') return
    render(page)
    expect(screen.getByRole('heading', {name: '为你推荐'})).toBeVisible()
    expect(document.querySelector('[data-home-feed-fallback]')).not.toBeNull()
  })

  it('returns a language-neutral Home shell without waiting for a fallback root locale', async () => {
    rootLocale.mockReturnValue(new Promise(() => undefined))
    const page = await Promise.race([
      Promise.resolve(HomePage({searchParams: new Promise(() => undefined)})),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 25)),
    ])

    expect(page).not.toBe('timed-out')
    if (page === 'timed-out') return
    render(page)
    expect(document.querySelector('[data-home-shell]')).not.toBeNull()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('reveals the anonymous public feed while optional authentication is still pending', async () => {
    const publicResult: Promise<SocialApiResult<FeedPage>> = Promise.resolve({status: 'ok', data: {items: [], nextCursor: null}})
    const personalization = new Promise<null>(() => undefined)
    const labels = await getMessages('en')

    render(await PublicForYouFeed({labels, locale: 'en', personalization, publicResult, returnTo: '/en'}))

    expect(screen.getByText('Nothing here yet')).toBeVisible()
  })
})
