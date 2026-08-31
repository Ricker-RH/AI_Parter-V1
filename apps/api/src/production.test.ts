import {describe, expect, it, vi} from 'vitest'
import {createProductionApp, createProductionDependencies} from './production.js'

const environment = {
  DATABASE_USER_URL: 'postgresql://user:secret@db.example/aifans',
  DATABASE_PLATFORM_URL: 'postgresql://platform:secret@db.example/aifans',
  DATABASE_PROVISIONING_URL: 'postgresql://provisioner:secret@db.example/aifans',
  NEON_AUTH_JWKS_URL: 'https://auth.example/.well-known/jwks.json',
  NEON_AUTH_ISSUER: 'https://auth.example',
  NEON_AUTH_AUDIENCE: 'aifans-api',
} as const

describe('production API composition', () => {
  it('injects every P0 runtime port without configuring optional chat', () => {
    expect(createProductionDependencies(environment)).toMatchObject({
      auth: expect.any(Object),
      authority: expect.any(Object),
      platformSocial: expect.any(Object),
      profiles: expect.any(Object),
      social: expect.any(Object),
      chatTargets: expect.any(Object),
    })
    expect(createProductionDependencies(environment).chat).toBeUndefined()
  })

  it('fails startup before serving when required configuration is absent', () => {
    expect(() => createProductionApp({})).toThrow('Invalid API environment')
  })

  it('exports a live Hono app with public health and strict auth', async () => {
    const app = createProductionApp(environment)
    expect((await app.request('/health')).status).toBe(200)
    const response = await app.request('/v1/me', {headers: {authorization: 'Bearer malformed'}})
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({code: 'AUTH_INVALID'})
  })

  it('binds database repositories to the explicitly parsed environment instead of process.env', () => {
    const database = {
      authority: {}, platformSocial: {}, profiles: {}, social: {}, chatTargets: {},
    }
    const createDatabaseRuntime = vi.fn(() => database)
    const previous = process.env.DATABASE_USER_URL
    process.env.DATABASE_USER_URL = 'postgresql://wrong:wrong@process.example/wrong'
    try {
      const dependencies = createProductionDependencies(environment, {createDatabaseRuntime} as never)
      expect(createDatabaseRuntime).toHaveBeenCalledWith({
        userUrl: environment.DATABASE_USER_URL,
        platformUrl: environment.DATABASE_PLATFORM_URL,
        provisioningUrl: environment.DATABASE_PROVISIONING_URL,
      })
      expect(dependencies).toMatchObject(database)
    } finally {
      if (previous === undefined) delete process.env.DATABASE_USER_URL
      else process.env.DATABASE_USER_URL = previous
    }
  })
})
