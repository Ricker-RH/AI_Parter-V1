import {act, fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

let pathname = '/en'
vi.mock('next/navigation', () => ({usePathname: () => pathname}))
vi.mock('../lib/analytics/provider.js', () => ({
  routeNameForPath: (value: string) => value === '/en' ? '/[locale]' : value === '/en/messages' ? '/[locale]/messages' : null,
  useAnalytics: () => ({capture: vi.fn(), identify: vi.fn(), page: vi.fn(), reset: vi.fn()}),
}))
vi.mock('../lib/analytics/performance.js', () => ({
  deviceType: () => 'desktop',
  trackPerformanceMeasured: vi.fn(),
}))
import {NavigationFeedback} from './NavigationFeedback.js'

describe('NavigationFeedback', () => {
  it('shows a non-blocking accessible pending status synchronously for an internal pointer activation', () => {
    render(<><NavigationFeedback locale="en" release="test"/><a href="/en/messages">Messages</a><main>Home</main></>)

    const link = screen.getByRole('link', {name: 'Messages'})
    link.focus()
    fireEvent.pointerDown(link, {button: 0})

    expect(screen.getByRole('status')).toHaveAttribute('data-navigation-pending', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(document.activeElement).toBe(link)
  })

  it('does not start feedback for external or modified navigation', () => {
    render(<><NavigationFeedback locale="en" release="test"/><a href="https://example.com">External</a><a href="/en/messages">Messages</a><main>Home</main></>)

    fireEvent.pointerDown(screen.getByRole('link', {name: 'External'}), {button: 0})
    fireEvent.pointerDown(screen.getByRole('link', {name: 'Messages'}), {button: 0, ctrlKey: true})

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('announces the pending state in Chinese without changing focus', () => {
    render(<><NavigationFeedback locale="zh-CN" release="test"/><a href="/zh-CN/messages">消息</a><main>首页</main></>)

    const link = screen.getByRole('link', {name: '消息'})
    link.focus()
    fireEvent.keyDown(link, {key: 'Enter'})

    expect(screen.getByRole('status')).toHaveTextContent('正在加载')
    expect(document.activeElement).toBe(link)
  })

  it('clears pending feedback only after the destination pathname and main are ready', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const view = render(<><NavigationFeedback locale="en" release="test"/><a href="/en/messages">Messages</a><main>Home</main></>)

    fireEvent.keyDown(screen.getByRole('link', {name: 'Messages'}), {key: 'Enter'})
    expect(screen.getByRole('status')).toBeInTheDocument()
    pathname = '/en/messages'
    view.rerender(<><NavigationFeedback locale="en" release="test"/><a href="/en/messages">Messages</a><main>Messages</main></>)
    act(() => { frames.forEach((frame) => frame(performance.now())) })

    expect(screen.queryByRole('status')).toBeNull()
    vi.unstubAllGlobals()
  })
})
