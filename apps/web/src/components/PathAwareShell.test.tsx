import {render} from '@testing-library/react'
import {expect, it, vi} from 'vitest'
import {PathAwareShell} from './PathAwareShell'
import type {ShellLabels} from './AppNav'

const route = vi.hoisted(() => ({pathname: '/en/messages/4a743763-b6e4-45e9-beac-ed564f58121f', query: ''}))
vi.mock('next/navigation', () => ({usePathname: () => route.pathname, useSearchParams: () => new URLSearchParams(route.query)}))
vi.mock('./AppNav', () => ({AppNav: () => null}))
vi.mock('./MobileNav', () => ({MobileNav: () => <nav className="mobile-nav">Navigation</nav>}))
vi.mock('./MobileTopBar', () => ({MobileTopBar: () => null}))
vi.mock('./NavigationFeedback', () => ({NavigationFeedback: () => null}))
vi.mock('./RouteReadySignal', () => ({RouteReadySignal: () => null}))

it('restores the current list shell even while an old hidden Activity retains a selected conversation', () => {
  const props = {authConfigured: true, creatorModeEnabled: false, labels: {} as ShellLabels, locale: 'en' as const, release: 'test'}
  const cachedPages = <><main data-selected="true" style={{display:'none'}}>Cached detail</main><main>Current list</main></>
  const view = render(<PathAwareShell {...props}>{cachedPages}</PathAwareShell>)
  expect(view.container.querySelector('.messages-shell')).toHaveAttribute('data-active-chat', 'true')
  route.pathname = '/en/messages'
  view.rerender(<PathAwareShell {...props}>{cachedPages}</PathAwareShell>)
  expect(view.container.querySelector('main[data-selected="true"]')).toBeInTheDocument()
  expect(view.container.querySelector('.messages-shell')).toHaveAttribute('data-active-chat', 'false')
  route.query = 'humanConversation=33333333-3333-4333-8333-333333333333'
  view.rerender(<PathAwareShell {...props}>{cachedPages}</PathAwareShell>)
  expect(view.container.querySelector('.messages-shell')).toHaveAttribute('data-active-chat', 'true')
  route.query = ''
  view.rerender(<PathAwareShell {...props}>{cachedPages}</PathAwareShell>)
  expect(view.container.querySelector('.messages-shell')).toHaveAttribute('data-active-chat', 'false')
})
