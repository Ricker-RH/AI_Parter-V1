import {describe, expect, it} from 'vitest'
import {resolveShellKind} from './route-shell.js'

describe('route shell resolver', () => {
  it.each([
    ['/en', 'public'],
    ['/en/auth/sign-in', 'auth'],
    ['/en/messages', 'messages'],
    ['/en/creator', 'creator'],
    ['/en/admin', 'admin'],
  ] as const)('resolves %s as %s', (pathname, shell) => {
    expect(resolveShellKind(pathname)).toBe(shell)
  })

  it('uses segment boundaries so child and query-like path text cannot select a special shell', () => {
    expect(resolveShellKind('/en/administer')).toBe('public')
    expect(resolveShellKind('/en/creatorial')).toBe('public')
    expect(resolveShellKind('/en/admin?source=nav')).toBe('admin')
    expect(resolveShellKind('/en?next=/admin')).toBe('public')
  })
})
