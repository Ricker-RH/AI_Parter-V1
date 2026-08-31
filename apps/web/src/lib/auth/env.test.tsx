import {describe, expect, it} from 'vitest'
import {readWebAuthEnv} from './env.js'

describe('Web Neon Auth environment', () => {
  it('is safely not configured when all auth variables are absent', () => {
    expect(readWebAuthEnv({})).toEqual({status: 'not-configured'})
  })

  it('accepts a complete secure Neon Auth configuration', () => {
    expect(readWebAuthEnv({
      NEON_AUTH_BASE_URL: 'https://auth.example/project/auth',
      NEON_AUTH_COOKIE_SECRET: 'x'.repeat(32),
    })).toEqual({
      status: 'configured',
      baseUrl: 'https://auth.example/project/auth',
      cookieSecret: 'x'.repeat(32),
    })
  })

  it('fails closed for partial, insecure, or short-secret configuration', () => {
    expect(() => readWebAuthEnv({NEON_AUTH_BASE_URL: 'https://auth.example'})).toThrow('Invalid Web auth environment')
    expect(() => readWebAuthEnv({NEON_AUTH_BASE_URL: 'http://auth.example', NEON_AUTH_COOKIE_SECRET: 'x'.repeat(32)})).toThrow('Invalid Web auth environment')
    expect(() => readWebAuthEnv({NEON_AUTH_BASE_URL: 'https://auth.example', NEON_AUTH_COOKIE_SECRET: 'short'})).toThrow('Invalid Web auth environment')
  })
})
