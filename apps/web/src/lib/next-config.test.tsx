import {afterEach, describe, expect, it, vi} from 'vitest'

const environment = process.env as Record<string, string | undefined>
const originalNodeEnv = environment.NODE_ENV
const originalSecret = environment.WEB_API_RATE_LIMIT_SIGNING_SECRET

afterEach(() => {
  vi.resetModules()
  if (originalNodeEnv === undefined) delete environment.NODE_ENV
  else environment.NODE_ENV = originalNodeEnv
  if (originalSecret === undefined) delete environment.WEB_API_RATE_LIMIT_SIGNING_SECRET
  else environment.WEB_API_RATE_LIMIT_SIGNING_SECRET = originalSecret
})

describe('Web production configuration', () => {
  it('fails startup without a valid private rate-limit signing secret', async () => {
    environment.NODE_ENV = 'production'
    delete environment.WEB_API_RATE_LIMIT_SIGNING_SECRET
    await expect(import('../../next.config.js')).rejects.toThrow('Invalid Web rate limit environment')
  })

  it('loads when production has an API-compatible private signing secret', async () => {
    environment.NODE_ENV = 'production'
    environment.WEB_API_RATE_LIMIT_SIGNING_SECRET = 'x'.repeat(32)
    await expect(import('../../next.config.js')).resolves.toHaveProperty('default')
  })
})
