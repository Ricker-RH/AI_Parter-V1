import {beforeEach, describe, expect, it, vi} from 'vitest'

const {createNeonAuth, token} = vi.hoisted(() => ({createNeonAuth: vi.fn(), token: vi.fn()}))
vi.mock('@neondatabase/auth/next/server', () => ({createNeonAuth}))
vi.mock('./env.js', () => ({readWebAuthEnv: vi.fn(() => ({status: 'configured', baseUrl: 'https://auth.example', cookieSecret: 'x'.repeat(32)}))}))

import {getApiBearerToken} from './server.js'

describe('API bearer token', () => {
  beforeEach(() => {
    createNeonAuth.mockReset().mockReturnValue({token})
    token.mockReset()
  })

  it('treats a provider error as unavailable instead of an anonymous session', async () => {
    token.mockResolvedValue({error: new Error('provider unavailable'), data: null})

    await expect(getApiBearerToken()).rejects.toThrow('Auth token provider unavailable')
  })
})
