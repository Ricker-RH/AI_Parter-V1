import {describe, expect, it} from 'vitest'
import {vi} from 'vitest'

const {connection} = vi.hoisted(() => ({connection: vi.fn()}))
vi.mock('next/server', () => ({connection}))

import * as authRoute from './page.js'

const AuthPage = authRoute.default
const {readResetToken} = authRoute

describe('auth recovery route', () => {
  it('enumerates every supported auth view for concrete prerender artifacts', () => {
    expect(authRoute.generateStaticParams()).toEqual([
      {view: 'sign-in'},
      {view: 'sign-up'},
      {view: 'forgot-password'},
      {view: 'reset-password'},
    ])
  })

  it.each([['en', 'sign-in'], ['zh-CN', 'reset-password']] as const)('waits for a request before reading %s %s URL data', async (locale, view) => {
    const events: string[] = []
    connection.mockReset().mockImplementation(async () => { events.push('connection') })
    const params = {then(resolve: (value: {locale: typeof locale; view: typeof view}) => unknown) { events.push('params'); return Promise.resolve({locale, view}).then(resolve) }} as Promise<{locale: typeof locale; view: typeof view}>

    await AuthPage({params, searchParams: Promise.resolve({})})

    expect(events).toEqual(['connection', 'params'])
  })

  it('keeps search-param and auth recovery work explicitly non-instant', () => {
    expect(authRoute.instant).toBe(false)
  })

  it('passes only a validated same-locale admin return target', async () => {
    const accepted = await AuthPage({
      params: Promise.resolve({locale: 'zh-CN', view: 'sign-in'}),
      searchParams: Promise.resolve({next: '/zh-CN/admin/creator'}),
    })
    const rejected = await AuthPage({
      params: Promise.resolve({locale: 'zh-CN', view: 'sign-in'}),
      searchParams: Promise.resolve({next: 'https://attacker.example'}),
    })

    expect(accepted.props).toMatchObject({returnTo: '/zh-CN/admin/creator'})
    expect(rejected.props.returnTo).toBeUndefined()
  })

  it('also accepts the separate user return allowlist without broadening admin routes', async () => {
    const accepted = await AuthPage({
      params: Promise.resolve({locale: 'en', view: 'sign-in'}),
      searchParams: Promise.resolve({next: '/en/messages'}),
    })

    expect(accepted.props).toMatchObject({returnTo: '/en/messages'})
  })

  it('makes the password-request page reachable', async () => {
    const page = await AuthPage({
      params: Promise.resolve({locale: 'en', view: 'forgot-password'}),
      searchParams: Promise.resolve({}),
    })
    expect(page.props).toMatchObject({locale: 'en', mode: 'forgot-password'})
  })

  it('passes only a bounded callback token to the reset page', async () => {
    const token = 'a'.repeat(32)
    expect(readResetToken(token)).toBe(token)
    expect(readResetToken('short')).toBeUndefined()
    expect(readResetToken(['a'.repeat(32)])).toBeUndefined()
    const page = await AuthPage({
      params: Promise.resolve({locale: 'zh-CN', view: 'reset-password'}),
      searchParams: Promise.resolve({token}),
    })
    expect(page.props).toMatchObject({locale: 'zh-CN', mode: 'reset-password', resetToken: token})
  })
})
