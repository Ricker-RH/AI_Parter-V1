import {describe, expect, it} from 'vitest'
import AuthPage, {readResetToken} from './page.js'

describe('auth recovery route', () => {
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
