import {act, fireEvent, render, screen} from '@testing-library/react'
import {useLayoutEffect} from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'

let pathname = '/en'
let search = ''
vi.mock('next/navigation', () => ({usePathname: () => pathname, useSearchParams: () => new URLSearchParams(search)}))
vi.mock('../lib/analytics/provider.js', () => ({
  routeNameForPath: (value: string) => value === '/en' ? '/[locale]' : value === '/en/messages' ? '/[locale]/messages' : null,
  useAnalytics: () => ({capture: vi.fn(), identify: vi.fn(), page: vi.fn(), reset: vi.fn()}),
}))
vi.mock('../lib/analytics/performance.js', () => ({
  deviceType: () => 'desktop',
  performanceBudget: (metric: string) => metric === 'interaction' ? 100 : metric === 'shell' ? 150 : 800,
  trackPerformanceMeasured: vi.fn(),
}))
import {NavigationFeedback} from './NavigationFeedback.js'
import {trackPerformanceMeasured} from '../lib/analytics/performance.js'

describe('NavigationFeedback', () => {
  afterEach(() => { pathname = '/en'; search = ''; vi.clearAllMocks(); vi.unstubAllGlobals() })

  it('records interaction, destination fallback, and ready timing for every route generation', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('performance', {now: vi.fn(() => 100)})
    pathname = '/en'
    search = ''
    const view = render(<><NavigationFeedback locale="en" release="test"/><a href="/en/messages">Messages</a><main>Home</main></>)

    fireEvent.pointerDown(screen.getByRole('link', {name: 'Messages'}), {button: 0})
    pathname = '/en/messages'
    view.rerender(<><NavigationFeedback locale="en" release="test"/><a href="/en">Home</a><main>Home</main><main className="route-skeleton">Loading</main></>)
    act(() => { document.dispatchEvent(new CustomEvent('aifans:route-ready', {detail: {generation: 1, route: '/en/messages'}})) })
    view.rerender(<><NavigationFeedback locale="en" release="test"/><a href="/en">Home</a><main>Messages</main></>)
    act(() => { frames.forEach((frame) => frame(100)) })

    pathname = '/en/messages'
    view.rerender(<><NavigationFeedback locale="en" release="test"/><a href="/en">Home</a><main>Messages</main></>)
    fireEvent.pointerDown(screen.getByRole('link', {name: 'Home'}), {button: 0})
    pathname = '/en'
    view.rerender(<><NavigationFeedback locale="en" release="test"/><a href="/en/messages">Messages</a><main>Messages</main><main className="route-skeleton">Loading</main></>)
    act(() => { document.dispatchEvent(new CustomEvent('aifans:route-ready', {detail: {generation: 2, route: '/en'}})) })
    view.rerender(<><NavigationFeedback locale="en" release="test"/><a href="/en/messages">Messages</a><main>Home</main></>)
    act(() => { frames.forEach((frame) => frame(100)) })

    const metrics = vi.mocked(trackPerformanceMeasured).mock.calls.map(([_, properties]) => properties)
    expect(metrics.map(({metric}) => metric)).toEqual(['interaction', 'shell', 'navigation', 'interaction', 'shell', 'navigation'])
    expect(metrics.map(({metric_id}) => metric_id)).toEqual([
      'navigation-1-interaction', 'navigation-1-shell', 'navigation-1-navigation',
      'navigation-2-interaction', 'navigation-2-shell', 'navigation-2-navigation',
    ])
    vi.unstubAllGlobals()
  })

  it('records shell and ready timing when pathname changes without an interaction start', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    pathname = '/en'
    search = ''
    const view = render(<><NavigationFeedback locale="en" release="test"/><main>Home</main></>)
    pathname = '/en/messages'
    window.dispatchEvent(new PopStateEvent('popstate'))
    view.rerender(<><NavigationFeedback locale="en" release="test"/><main>Home</main><main className="route-skeleton">Loading</main></>)
    act(() => { document.dispatchEvent(new CustomEvent('aifans:route-ready', {detail: {generation: 1, route: '/en/messages'}})) })
    view.rerender(<><NavigationFeedback locale="en" release="test"/><main>Messages</main></>)
    act(() => { frames.forEach((frame) => frame(performance.now())) })
    const metrics = vi.mocked(trackPerformanceMeasured).mock.calls.map(([_, properties]) => properties)
    expect(metrics.map(({metric}) => metric)).toEqual(['shell', 'navigation'])
    expect(metrics.every(({metric_id}) => metric_id.startsWith('navigation-1-'))).toBe(true)
    vi.unstubAllGlobals()
  })

  it('acknowledges a route-ready event emitted before the passive pending effect', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    pathname = '/en'
    function ReadyBeforePassive() {
      useLayoutEffect(() => {
        document.dispatchEvent(new CustomEvent('aifans:route-ready', {detail: {generation: 1, route: '/en/messages'}}))
      }, [])
      return null
    }
    const view = render(<><ReadyBeforePassive/><NavigationFeedback locale="en" release="test"/><main>Home</main></>)
    pathname = '/en/messages'
    view.rerender(<><ReadyBeforePassive/><NavigationFeedback locale="en" release="test"/><main>Messages</main></>)
    act(() => { frames.forEach((frame) => frame(performance.now())) })
    expect(screen.queryByRole('status')).toBeNull()
    expect(vi.mocked(trackPerformanceMeasured).mock.calls.map(([_, properties]) => properties.metric)).toContain('navigation')
    vi.unstubAllGlobals()
  })

  it('ignores delayed older route-ready generations without corrupting the current destination', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    pathname = '/en'
    const view = render(<><NavigationFeedback locale="en" release="test"/><main>Home</main></>)
    pathname = '/en/messages'
    view.rerender(<><NavigationFeedback locale="en" release="test"/><main>Messages</main></>)
    act(() => {
      document.dispatchEvent(new CustomEvent('aifans:route-ready', {detail: {generation: 2, route: '/en/messages'}}))
      document.dispatchEvent(new CustomEvent('aifans:route-ready', {detail: {generation: 1, route: '/en'}}))
    })
    act(() => { frames.forEach((frame) => frame(performance.now())) })
    expect(screen.queryByRole('status')).toBeNull()
    expect(vi.mocked(trackPerformanceMeasured).mock.calls.at(-1)?.[1]).toMatchObject({metric: 'navigation', metric_id: 'navigation-1-navigation'})
    vi.unstubAllGlobals()
  })

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

  it('tracks query-only internal navigation and clears once its full destination is current', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const view = render(<><NavigationFeedback locale="en" release="test"/><a href="/en?feed=following">Following</a><main>Home</main></>)
    fireEvent.pointerDown(screen.getByRole('link', {name: 'Following'}), {button: 0})
    expect(screen.getByRole('status')).toBeInTheDocument()
    search = 'feed=following'
    view.rerender(<><NavigationFeedback locale="en" release="test"/><a href="/en?feed=following">Following</a><main>Following</main></>)
    act(() => { document.dispatchEvent(new CustomEvent('aifans:route-ready', {detail: {generation: 1, route: '/en?feed=following'}})) })
    act(() => { frames.forEach((frame) => frame(performance.now())) })
    expect(screen.queryByRole('status')).toBeNull()
    vi.unstubAllGlobals()
    search = ''
  })

  it('clears feedback when a pointer activation is cancelled', () => {
    render(<><NavigationFeedback locale="en" release="test"/><a href="/en/messages">Messages</a><main>Home</main></>)
    const link = screen.getByRole('link', {name: 'Messages'})
    fireEvent.pointerDown(link, {button: 0})
    fireEvent.pointerCancel(link)
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
    act(() => { document.dispatchEvent(new CustomEvent('aifans:route-ready', {detail: {generation: 1, route: '/en/messages'}})) })
    act(() => { frames.forEach((frame) => frame(performance.now())) })

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('main')).not.toHaveAttribute('data-route-ready')
    vi.unstubAllGlobals()
  })

  it('keeps feedback pending while the destination skeleton is visible beside the previous route main', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    pathname = '/en'
    const view = render(<><NavigationFeedback locale="en" release="test"/><a href="/en/messages">Messages</a><main>Home</main></>)

    fireEvent.pointerDown(screen.getByRole('link', {name: 'Messages'}), {button: 0})
    pathname = '/en/messages'
    view.rerender(<><NavigationFeedback locale="en" release="test"/><a href="/en/messages">Messages</a><main>Home</main><main className="route-skeleton">Loading messages</main></>)
    act(() => { frames.forEach((frame) => frame(performance.now())) })

    expect(screen.getByRole('status')).toBeInTheDocument()
    vi.unstubAllGlobals()
    pathname = '/en'
  })

  it('does not treat an updated previous main as ready after the destination skeleton disappears', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    pathname = '/en'
    const view = render(<><NavigationFeedback locale="en" release="test"/><a href="/en/messages">Messages</a><main>Home</main></>)

    fireEvent.pointerDown(screen.getByRole('link', {name: 'Messages'}), {button: 0})
    pathname = '/en/messages'
    view.rerender(<><NavigationFeedback locale="en" release="test"/><a href="/en/messages">Messages</a><main>Home updated in place</main></>)
    act(() => { frames.forEach((frame) => frame(performance.now())) })

    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      document.dispatchEvent(new CustomEvent('aifans:route-ready', {detail: {generation: 1, route: '/en/messages'}}))
    })
    act(() => { frames.forEach((frame) => frame(performance.now())) })

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('main')).not.toHaveAttribute('data-route-ready')
    vi.unstubAllGlobals()
    pathname = '/en'
  })
})
