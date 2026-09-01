import {Hono} from 'hono'
import {describe, expect, it, vi} from 'vitest'
import {requestIdMiddleware, type ApiVariables} from '../middleware/request-id.js'
import {registerMeRoutes} from './me.js'

const account = {
  id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30', kind: 'human' as const,
  username: 'rui', displayName: 'Rui', bio: null,
  preferredLocale: 'en' as const, creatorModeEnabled: false,
}

function setup(overrides: {auth?: unknown; profiles?: unknown} = {}) {
  const updateCurrentAccount = vi.fn(async () => account)
  const profiles = {
    ensureHumanProfile: vi.fn(async () => account),
    getCurrentAccount: vi.fn(async () => account),
    updateCurrentAccount,
    ...(overrides.profiles as object ?? {}),
  }
  const app = new Hono<{Variables: ApiVariables}>()
  app.use('*', requestIdMiddleware)
  registerMeRoutes(app, {
    auth: overrides.auth ?? {verify: vi.fn(async () => ({status: 'authenticated' as const, identity: {subject: 'subject'}}))},
    profiles,
  })
  return {app, profiles}
}

describe('current account routes', () => {
  it('patches only actor-owned profile fields and returns the updated account', async () => {
    const {app, profiles} = setup()
    const response = await app.request('/v1/me', {
      method: 'PATCH', headers: {'content-type': 'application/json'},
      body: JSON.stringify({username: 'rui_2', displayName: 'Rui 2', bio: null, preferredLocale: 'zh-CN'}),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(account)
    expect(profiles.updateCurrentAccount).toHaveBeenCalledWith({subject: 'subject'}, {
      username: 'rui_2', displayName: 'Rui 2', bio: null, preferredLocale: 'zh-CN',
    })
  })

  it('rejects unknown, forged, duplicate, and empty patch bodies', async () => {
    const {app, profiles} = setup()
    for (const body of [
      {id: account.id, displayName: 'forged'},
      {creatorModeEnabled: true},
      {},
    ]) {
      const response = await app.request('/v1/me', {
        method: 'PATCH', headers: {'content-type': 'application/json'}, body: JSON.stringify(body),
      })
      expect(response.status).toBe(422)
    }
    const duplicate = await app.request('/v1/me', {
      method: 'PATCH', headers: {'content-type': 'application/json'}, body: '{"bio":"one","bio":"two"}',
    })
    expect(duplicate.status).toBe(422)
    expect(profiles.updateCurrentAccount).not.toHaveBeenCalled()
  })

  it('authenticates before accepting a patch and maps username conflicts safely', async () => {
    const missing = setup({auth: {verify: vi.fn(async () => ({status: 'missing' as const}))}})
    expect((await missing.app.request('/v1/me', {method: 'PATCH', headers: {'content-type': 'application/json'}, body: '{}'})).status).toBe(401)
    const conflict = setup({profiles: {updateCurrentAccount: vi.fn(async () => { throw {code: '23505', constraint: 'profiles_username_unique'} })}})
    const response = await conflict.app.request('/v1/me', {
      method: 'PATCH', headers: {'content-type': 'application/json'}, body: JSON.stringify({username: 'taken_name'}),
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({code: 'USERNAME_TAKEN'})
  })

  it('rejects a declared oversized patch before parsing it', async () => {
    const {app} = setup()
    const response = await app.request('/v1/me', {
      method: 'PATCH', headers: {'content-type': 'application/json', 'content-length': '70000'}, body: '{}',
    })
    expect(response.status).toBe(413)
  })
})
