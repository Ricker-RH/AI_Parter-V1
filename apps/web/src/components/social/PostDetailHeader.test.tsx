import {fireEvent, render, screen} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {PostDetailHeader, hasSameOriginAppReferrer} from './PostDetailHeader.js'

const router = {back: vi.fn(), push: vi.fn(), refresh: vi.fn()}
vi.mock('next/navigation', () => ({useRouter: () => router}))

const labels = {back: 'Back', copyLink: 'Copy link', copySuccess: 'Link copied.', post: 'Post', postActions: 'Post actions', refresh: 'Refresh', share: 'Share', shareSuccess: 'Shared.'}
const postId = '22222222-2222-4222-8222-222222222222'

describe('PostDetailHeader', () => {
  beforeEach(() => {
    router.back.mockReset(); router.push.mockReset(); router.refresh.mockReset()
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: vi.fn(async () => undefined)}})
    Object.defineProperty(navigator, 'share', {configurable: true, value: undefined})
  })

  it('returns only to a same-origin application referrer and otherwise goes to locale Home', () => {
    expect(hasSameOriginAppReferrer('https://app.example/en/search?q=luna', 'https://app.example', 'en')).toBe(true)
    expect(hasSameOriginAppReferrer('https://elsewhere.example/en', 'https://app.example', 'en')).toBe(false)
    expect(hasSameOriginAppReferrer('', 'https://app.example', 'en')).toBe(false)
    render(<PostDetailHeader labels={labels} locale="en" postId={postId} referrer="https://elsewhere.example/" />)
    fireEvent.click(screen.getByRole('button', {name: 'Back'}))
    expect(router.push).toHaveBeenCalledWith('/en')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('supports the same header actions for a non-post detail resource', async () => {
    render(<PostDetailHeader actionsLabel="Channel actions" canonicalPath="/en/channels/future-city" fallbackHref="/en/channels" labels={labels} locale="en" referrer="" title="Future City" />)
    expect(screen.getByRole('heading', {name: 'Future City'})).toBeVisible()
    fireEvent.click(screen.getByRole('button', {name: 'Back'}))
    expect(router.push).toHaveBeenCalledWith('/en/channels')
    fireEvent.click(screen.getByRole('button', {name: 'Channel actions'}))
    fireEvent.click(screen.getByRole('menuitem', {name: 'Copy link'}))
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(new URL('/en/channels/future-city', window.location.origin).toString()))
  })

  it('uses a centered AIFANS mark on phone chrome while retaining an accessible localized heading', () => {
    const {container} = render(<PostDetailHeader labels={labels} locale="en" postId={postId} referrer="" />)

    expect(screen.getByRole('link', {name: 'AIFANS'})).toHaveClass('post-detail-brand')
    expect(screen.getByRole('heading', {name: 'Post'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'Back'}).querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', {name: 'Post actions'}).querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not expose an unconnected post-view count interface', () => {
    const source = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/social/PostDetailHeader.tsx' : 'apps/web/src/components/social/PostDetailHeader.tsx', 'utf8')

    expect(source).not.toContain('viewCount')
    expect(source).not.toContain('post-detail-view-count')
    expect(source).not.toMatch(/\bviews\b/)
  })

  it('keeps the opaque action menu above the bounded content frame', () => {
    const root = process.cwd().endsWith('/apps/web') ? 'src' : 'apps/web/src'
    const stylesheet = readFileSync(`${root}/app/globals.css`, 'utf8')
    const surfaceStylesheet = readFileSync(`${root}/components/social/SocialSurface.module.css`, 'utf8')

    expect(stylesheet).toMatch(/:root\s*\{[^}]*--shell-surface:\s*#[0-9a-f]{6}/i)
    expect(stylesheet).toMatch(/\[data-theme="dark"\]\s*\{[^}]*--shell-surface:\s*#[0-9a-f]{6}/i)
    expect(stylesheet).toMatch(/\.post-detail-menu-list\s*\{[^}]*background:\s*var\(--shell-surface\)[^}]*position:\s*absolute[^}]*z-index:\s*30/)
    expect(surfaceStylesheet).toMatch(/\.surface\s*\{[^}]*isolation:\s*isolate/)
    expect(surfaceStylesheet).toMatch(/\.frame\s*\{[^}]*position:\s*relative[^}]*z-index:\s*0/)
    expect(surfaceStylesheet).toMatch(/\.header\s*\{[^}]*background:\s*var\(--shell-surface\)[^}]*position:\s*relative[^}]*z-index:\s*1/)
  })

  it('uses app history when the referrer is same-origin and in the selected locale', () => {
    render(<PostDetailHeader labels={labels} locale="en" postId={postId} referrer={new URL('/en/search', window.location.origin).toString()} />)
    fireEvent.click(screen.getByRole('button', {name: 'Back'}))
    expect(router.back).toHaveBeenCalledOnce()
  })

  it('refreshes from the menu and dismisses on outside pointer interaction', () => {
    render(<><PostDetailHeader labels={labels} locale="en" postId={postId} referrer="" /><button type="button">Outside</button></>)
    const trigger = screen.getByRole('button', {name: 'Post actions'})

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', {name: 'Refresh'}))
    expect(router.refresh).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', {name: 'Outside'}))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('offers only refresh, copy canonical link, and share with keyboard-safe focus restoration', async () => {
    render(<PostDetailHeader labels={labels} locale="en" postId={postId} referrer="" />)
    const trigger = screen.getByRole('button', {name: 'Post actions'})
    fireEvent.keyDown(trigger, {key: 'ArrowDown'})
    expect(screen.getByRole('menuitem', {name: 'Refresh'})).toHaveFocus()
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Refresh', 'Copy link', 'Share'])
    fireEvent.keyDown(document, {key: 'Escape'})
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', {name: 'Copy link'}))
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(new URL(`/en/posts/${postId}`, window.location.origin).toString()))
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Link copied.'))
    expect(trigger).toHaveFocus()
  })

  it('uses native sharing, falls back to clipboard when unavailable, and treats share cancellation as safe', async () => {
    const share = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'share', {configurable: true, value: share})
    render(<PostDetailHeader labels={labels} locale="en" postId={postId} referrer="" />)
    fireEvent.click(screen.getByRole('button', {name: 'Post actions'}))
    fireEvent.click(screen.getByRole('menuitem', {name: 'Share'}))
    await vi.waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({url: new URL(`/en/posts/${postId}`, window.location.origin).toString()})))
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Shared.'))

    share.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
    fireEvent.click(screen.getByRole('button', {name: 'Post actions'}))
    fireEvent.click(screen.getByRole('menuitem', {name: 'Share'}))
    await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(2))
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()

    Object.defineProperty(navigator, 'share', {configurable: true, value: undefined})
    await vi.waitFor(() => expect(screen.getByRole('button', {name: 'Post actions'})).toHaveAttribute('aria-expanded', 'false'))
    fireEvent.click(screen.getByRole('button', {name: 'Post actions'}))
    fireEvent.click(screen.getByRole('menuitem', {name: 'Share'}))
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(new URL(`/en/posts/${postId}`, window.location.origin).toString()))
  })
})
