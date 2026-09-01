import {describe, expect, it} from 'vitest'
import {AccountSchema, ApiErrorSchema} from '@aifans/contracts'
import {createApp} from './application.js'
import type {AuthVerifier} from './ports/auth.js'
import type {ProfilePort} from './ports/profiles.js'

describe('AIFANS API shell', () => {
  it('returns public health with a correlated request ID', async () => {
    const response = await createApp().request('/health')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(await response.json()).toEqual({status: 'ok', service: 'aifans-api'})
  })

  it('returns a typed not-found error with the same request ID', async () => {
    const response = await createApp().request('/does-not-exist')
    const requestId = response.headers.get('x-request-id')
    const body = ApiErrorSchema.parse(await response.json())

    expect(response.status).toBe(404)
    expect(body).toMatchObject({code: 'NOT_FOUND', requestId})
  })
})

describe('GET /v1/me', () => {
  const missingAuth = {verify: async () => ({status: 'missing'} as const)} satisfies AuthVerifier
  const invalidAuth = {verify: async () => ({status: 'invalid'} as const)} satisfies AuthVerifier
  const identity = {
    subject: 'neon_auth_subject',
    email: 'luna@example.com',
    displayName: 'Luna',
  }
  const validAuth = {verify: async () => ({status: 'authenticated', identity} as const)} satisfies AuthVerifier
  const account = AccountSchema.parse({
    id: '245652a3-c5d8-4b60-b94d-c1556db030ff',
    kind: 'human',
    username: 'luna',
    displayName: 'Luna',
    preferredLocale: 'en',
    creatorModeEnabled: false,
  })

  function profiles(currentAccount: typeof account | null = account): ProfilePort {
    return {
      ensureHumanProfile: async (_input: unknown) => undefined,
      getCurrentAccount: async (_actor: unknown) => currentAccount,
    }
  }

  async function expectError(
    response: Response,
    status: number,
    code: string,
  ) {
    const requestId = response.headers.get('x-request-id')
    const body = ApiErrorSchema.parse(await response.json())

    expect(response.status).toBe(status)
    expect(body).toMatchObject({code, requestId})
  }

  it('returns AUTH_REQUIRED when no credential is provided', async () => {
    await expectError(
      await createApp({auth: missingAuth, profiles: profiles()}).request('/v1/me'),
      401,
      'AUTH_REQUIRED',
    )
  })

  it('returns AUTH_NOT_CONFIGURED when no auth adapter is configured', async () => {
    await expectError(
      await createApp({profiles: profiles()}).request('/v1/me'),
      503,
      'AUTH_NOT_CONFIGURED',
    )
  })

  it('returns AUTH_INVALID when the credential is invalid', async () => {
    await expectError(
      await createApp({auth: invalidAuth, profiles: profiles()}).request('/v1/me'),
      401,
      'AUTH_INVALID',
    )
  })

  it('provisions the verified identity once before loading the current account', async () => {
    const calls: unknown[] = []
    const testProfiles = {
      ensureHumanProfile: async (input: unknown) => {
        calls.push(input)
      },
      getCurrentAccount: async (_actor: unknown) => account,
    } satisfies ProfilePort

    const response = await createApp({auth: validAuth, profiles: testProfiles}).request('/v1/me')

    expect(response.status).toBe(200)
    expect(calls).toEqual([{
      authSubject: identity.subject,
      email: identity.email,
      displayName: identity.displayName,
    }])
  })

  it('loads the current account using only the verified subject', async () => {
    const calls: unknown[] = []
    const testProfiles = {
      ensureHumanProfile: async (_input: unknown) => undefined,
      getCurrentAccount: async (actor: unknown) => {
        calls.push(actor)
        return account
      },
    } satisfies ProfilePort

    const response = await createApp({auth: validAuth, profiles: testProfiles}).request('/v1/me')

    expect(response.status).toBe(200)
    expect(calls).toEqual([{subject: identity.subject}])
  })

  it('returns the contract account object', async () => {
    const response = await createApp({auth: validAuth, profiles: profiles()}).request('/v1/me')

    expect(response.status).toBe(200)
    expect(AccountSchema.parse(await response.json())).toEqual(account)
  })

  it('returns PROFILE_NOT_AVAILABLE when no current account exists', async () => {
    await expectError(
      await createApp({auth: validAuth, profiles: profiles(null)}).request('/v1/me'),
      500,
      'PROFILE_NOT_AVAILABLE',
    )
  })

  it('redacts unexpected collaborator errors', async () => {
    const response = await createApp({
      auth: validAuth,
      profiles: {
        ensureHumanProfile: async () => {
          throw new Error('database password leaked')
        },
        getCurrentAccount: async () => account,
      } satisfies ProfilePort,
    }).request('/v1/me')

    const responseBody = await response.clone().text()
    await expectError(response, 500, 'INTERNAL_ERROR')
    expect(responseBody).not.toContain('database password leaked')
  })

  it('returns AUTH_INVALID for an authenticated identity with a blank subject', async () => {
    await expectError(
      await createApp({
        auth: {verify: async () => ({status: 'authenticated', identity: {...identity, subject: '  '}} as const)} satisfies AuthVerifier,
        profiles: profiles(),
      }).request('/v1/me'),
      401,
      'AUTH_INVALID',
    )
  })
})
