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

  it('uses app history when the referrer is same-origin and in the selected locale', () => {
    render(<PostDetailHeader labels={labels} locale="en" postId={postId} referrer={new URL('/en/search', window.location.origin).toString()} />)
    fireEvent.click(screen.getByRole('button', {name: 'Back'}))
    expect(router.back).toHaveBeenCalledOnce()
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
