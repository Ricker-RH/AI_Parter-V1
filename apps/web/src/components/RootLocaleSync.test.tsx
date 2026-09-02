import {render} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {usePathname} = vi.hoisted(() => ({usePathname: vi.fn(() => '/en')}))
vi.mock('next/navigation', () => ({usePathname}))

import {RootLocaleSync} from './RootLocaleSync.js'
import {resolveShellKind} from './shell/route-shell.js'

describe('RootLocaleSync', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en'
  })

  it.each([
    ['/zh-CN/feed', 'zh-CN'],
    ['/en/feed', 'en'],
    ['/fr/feed', 'en'],
  ])('synchronizes a soft-navigation pathname %s to lang %s', (pathname, expected) => {
    usePathname.mockReturnValue(pathname)
    render(<RootLocaleSync />)
    expect(document.documentElement.lang).toBe(expected)
    expect(document.documentElement.dataset.routeShell).toBe(resolveShellKind(pathname))
  })

  it.each(['/en/admin', '/zh-CN/auth/sign-in', '/en/messages/thread-1', '/zh-CN/notifications', '/en/creator/draft-1'])('synchronizes route shell state after soft navigation to %s', (pathname) => {
    usePathname.mockReturnValue(pathname)
    render(<RootLocaleSync />)
    expect(document.documentElement.dataset.routeShell).toBe(resolveShellKind(pathname))
  })
})
