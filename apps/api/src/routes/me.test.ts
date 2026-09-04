import {randomUUID} from 'node:crypto'
import {Hono} from 'hono'
import {describe, expect, it, vi} from 'vitest'
import {requestIdMiddleware, type ApiVariables} from '../middleware/request-id.js'
import {registerMeRoutes} from './me.js'

const profileId = '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30'
const assetId = 'f7568bb8-315d-44e9-8c1a-4f9ce93ba210'
const stagingObjectKey = `staging/profiles/${profileId}/avatar/${assetId}.png`
const finalObjectKey = `public/profiles/${profileId}/avatar/${assetId}.webp`
const account = {
  id: profileId, kind: 'human' as const,
  username: 'rui', displayName: 'Rui', bio: null,
  preferredLocale: 'en' as const, creatorModeEnabled: false,
  profileVersion: 3,
  background: {type: 'color' as const, colorKey: 'paper' as const},
}
const reservation = {
  id: assetId,
  ownerProfileId: profileId,
  role: 'avatar' as const,
  stagingObjectKey,
  finalObjectKey,
  uploadContentType: 'image/png' as const,
  finalContentType: 'image/webp' as const,
  sizeBytes: 4_096,
  width: 512,
  height: 512,
  expiresAt: '2026-09-04T00:05:00.000Z',
  verifiedAt: null,
}

function setup(overrides: {auth?: unknown; profiles?: unknown; profileAssets?: unknown} = {}) {
  const updateCurrentAccount = vi.fn(async () => account)
  const profiles = {
    ensureHumanProfile: vi.fn(async () => account),
    getCurrentAccount: vi.fn(async () => account),
    updateCurrentAccount,
    reserveProfileAsset: vi.fn(async () => reservation),
    getProfileAssetReservation: vi.fn(async () => reservation),
    confirmProfileAsset: vi.fn(async () => ({...reservation, verifiedAt: '2026-09-04T00:01:00.000Z'})),
    ...(overrides.profiles as object ?? {}),
  }
  const profileAssets = overrides.profileAssets === undefined ? {
    createUploadIntent: vi.fn(async () => ({
      method: 'PUT' as const,
      url: 'https://signed.example/upload',
      headers: {'content-type': 'image/png' as const},
      expiresAt: reservation.expiresAt,
      maxBytes: 10_485_760 as const,
    })),
    finalizeUpload: vi.fn(async () => ({finalObjectKey, contentType: 'image/webp' as const,
      sizeBytes: 1_024, width: 512, height: 512})),
  } : overrides.profileAssets
  const app = new Hono<{Variables: ApiVariables}>()
  app.use('*', requestIdMiddleware)
  registerMeRoutes(app, {
    auth: overrides.auth ?? {verify: vi.fn(async () => ({status: 'authenticated' as const, identity: {subject: 'subject'}}))},
    profiles,
    profileAssets: profileAssets as never,
  })
  return {app, profiles, profileAssets: profileAssets as {createUploadIntent: ReturnType<typeof vi.fn>; finalizeUpload: ReturnType<typeof vi.fn>}}
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  expect(await response.clone().json()).toMatchObject({code, requestId: expect.any(String)})
}

describe('current account routes', () => {
  it('patches only actor-owned profile fields and returns the updated account', async () => {
    const {app, profiles} = setup()
    const response = await app.request('/v1/me', {
      method: 'PATCH', headers: {'content-type': 'application/json'},
      body: JSON.stringify({profileVersion: 3, username: 'rui_2', displayName: 'Rui 2', bio: null, preferredLocale: 'zh-CN'}),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(account)
    expect(profiles.updateCurrentAccount).toHaveBeenCalledWith({subject: 'subject'}, {
      profileVersion: 3, username: 'rui_2', displayName: 'Rui 2', bio: null, preferredLocale: 'zh-CN',
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
      method: 'PATCH', headers: {'content-type': 'application/json'}, body: '{"profileVersion":3,"bio":"one","bio":"two"}',
    })
    expect(duplicate.status).toBe(422)
    expect(profiles.updateCurrentAccount).not.toHaveBeenCalled()
  })

  it('authenticates before accepting a patch and maps username conflicts safely', async () => {
    const missing = setup({auth: {verify: vi.fn(async () => ({status: 'missing' as const}))}})
    expect((await missing.app.request('/v1/me', {method: 'PATCH', headers: {'content-type': 'application/json'}, body: '{}'})).status).toBe(401)
    const conflict = setup({profiles: {updateCurrentAccount: vi.fn(async () => { throw {code: '23505', constraint: 'profiles_username_unique'} })}})
    const response = await conflict.app.request('/v1/me', {
      method: 'PATCH', headers: {'content-type': 'application/json'}, body: JSON.stringify({profileVersion: 3, username: 'taken_name'}),
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

  it('authenticates before parsing profile asset requests', async () => {
    const verify = vi.fn(async () => ({status: 'missing' as const}))
    const {app, profiles} = setup({auth: {verify}})
    await expectError(await app.request('/v1/me/assets/upload-intent?forged=1', {
      method: 'POST', headers: {'content-type': 'application/json'}, body: '{invalid',
    }), 401, 'AUTH_REQUIRED')
    await expectError(await app.request(`/v1/me/assets/${assetId}/confirm`, {
      method: 'POST', headers: {'content-type': 'application/json'}, body: '{invalid',
    }), 401, 'AUTH_REQUIRED')
    expect(verify).toHaveBeenCalledTimes(2)
    expect(profiles.reserveProfileAsset).not.toHaveBeenCalled()
  })

  it('reserves metadata before signing and exposes only the public intent contract', async () => {
    const {app, profiles, profileAssets} = setup()
    const response = await app.request('/v1/me/assets/upload-intent', {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({role: 'avatar', contentType: 'image/png', sizeBytes: 4_096, width: 512, height: 512}),
    })
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toEqual({
      assetId,
      method: 'PUT',
      url: 'https://signed.example/upload',
      headers: {'content-type': 'image/png'},
      expiresAt: reservation.expiresAt,
      maxBytes: 10_485_760,
    })
    expect(JSON.stringify(body)).not.toContain('objectKey')
    expect(profiles.ensureHumanProfile).toHaveBeenCalledBefore(profiles.reserveProfileAsset)
    expect(profiles.reserveProfileAsset).toHaveBeenCalledWith({subject: 'subject'}, {
      role: 'avatar', contentType: 'image/png', sizeBytes: 4_096, width: 512, height: 512,
    })
    expect(profileAssets.createUploadIntent).toHaveBeenCalledWith({
      stagingObjectKey, finalObjectKey, contentType: 'image/png', sizeBytes: 4_096,
      expiresAt: reservation.expiresAt,
    })
  })

  it('strictly validates upload intent query/body and preserves the request body limit', async () => {
    const {app, profiles} = setup()
    await expectError(await app.request('/v1/me/assets/upload-intent?role=avatar', {
      method: 'POST', headers: {'content-type': 'application/json'}, body: '{}',
    }), 400, 'INVALID_REQUEST')
    for (const body of [
      {role: 'avatar', contentType: 'image/png', sizeBytes: 4_096, width: 512, height: 512, objectKey: finalObjectKey},
      {role: 'portrait', contentType: 'image/png', sizeBytes: 4_096, width: 512, height: 512},
    ]) {
      await expectError(await app.request('/v1/me/assets/upload-intent', {
        method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body),
      }), 422, 'INVALID_REQUEST')
    }
    await expectError(await app.request('/v1/me/assets/upload-intent', {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: '{"role":"avatar","role":"background"}',
    }), 422, 'INVALID_REQUEST')
    await expectError(await app.request('/v1/me/assets/upload-intent', {
      method: 'POST', headers: {'content-type': 'application/json', 'content-length': '65537'}, body: '{}',
    }), 413, 'PAYLOAD_TOO_LARGE')
    expect(profiles.reserveProfileAsset).not.toHaveBeenCalled()
  })

  it('loads an actor-owned reservation, finalizes storage, then confirms the immutable final key', async () => {
    const {app, profiles, profileAssets} = setup()
    const response = await app.request(`/v1/me/assets/${assetId}/confirm`, {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({assetId}),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({assetId, role: 'avatar'})
    expect(profileAssets.finalizeUpload).toHaveBeenCalledWith({
      stagingObjectKey, finalObjectKey, role: 'avatar', contentType: 'image/png',
      sizeBytes: 4_096, width: 512, height: 512,
    })
    expect(profileAssets.finalizeUpload).toHaveBeenCalledBefore(profiles.confirmProfileAsset)
    expect(profiles.confirmProfileAsset).toHaveBeenCalledWith({subject: 'subject'}, assetId, finalObjectKey)
  })

  it('maps a reservation that expires between inspection and confirmation to a safe conflict', async () => {
    const {app} = setup({profiles: {confirmProfileAsset: vi.fn(async () => null)}})
    const response = await app.request(`/v1/me/assets/${assetId}/confirm`, {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({assetId}),
    })
    await expectError(response, 409, 'PROFILE_ASSET_EXPIRED')
    const errorBody = await response.text()
    expect(errorBody).not.toContain(stagingObjectKey)
    expect(errorBody).not.toContain(finalObjectKey)
  })

  it('rejects invalid/mismatched confirmation IDs and strict query/body input', async () => {
    const {app, profiles} = setup()
    for (const request of [
      ['/v1/me/assets/not-a-uuid/confirm', JSON.stringify({assetId})],
      [`/v1/me/assets/${assetId}/confirm?extra=1`, JSON.stringify({assetId})],
      [`/v1/me/assets/${assetId}/confirm`, JSON.stringify({assetId: randomUUID()})],
      [`/v1/me/assets/${assetId}/confirm`, JSON.stringify({assetId, objectKey: finalObjectKey})],
      [`/v1/me/assets/${assetId}/confirm`, `{"assetId":"${assetId}","assetId":"${assetId}"}`],
    ] as const) {
      const response = await app.request(request[0], {
        method: 'POST', headers: {'content-type': 'application/json'}, body: request[1],
      })
      expect([400, 422]).toContain(response.status)
    }
    expect(profiles.getProfileAssetReservation).not.toHaveBeenCalled()
  })

  it('maps missing, expired, not-owned, unconfigured, and invalid uploads without leaking keys', async () => {
    for (const missingReservation of [null]) {
      const {app} = setup({profiles: {getProfileAssetReservation: vi.fn(async () => missingReservation)}})
      await expectError(await app.request(`/v1/me/assets/${assetId}/confirm`, {
        method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({assetId}),
      }), 404, 'PROFILE_ASSET_NOT_FOUND')
    }
    const unavailable = setup({profileAssets: null})
    await expectError(await unavailable.app.request('/v1/me/assets/upload-intent', {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({role: 'avatar', contentType: 'image/png', sizeBytes: 4_096, width: 512, height: 512}),
    }), 503, 'PROFILE_ASSETS_NOT_CONFIGURED')

    for (const [message, status, code] of [
      ['PROFILE_ASSET_NOT_FOUND', 409, 'PROFILE_ASSET_NOT_READY'],
      ['PROFILE_ASSET_INVALID', 422, 'PROFILE_ASSET_INVALID'],
    ] as const) {
      const configured = setup({profileAssets: {
        createUploadIntent: vi.fn(),
        finalizeUpload: vi.fn(async () => { throw new Error(`${message}: ${stagingObjectKey}`) }),
      }})
      const response = await configured.app.request(`/v1/me/assets/${assetId}/confirm`, {
        method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({assetId}),
      })
      await expectError(response, status, code)
      expect(await response.clone().text()).not.toContain(stagingObjectKey)
      expect(await response.clone().text()).not.toContain(finalObjectKey)
    }
  })

  it('maps corrupt images to 422 and storage failures to 503 without confirming or leaking keys', async () => {
    for (const [message, status, code] of [
      [`PROFILE_ASSET_INVALID: ${stagingObjectKey}`, 422, 'PROFILE_ASSET_INVALID'],
      [`PROFILE_ASSET_STORAGE_UNAVAILABLE: ${stagingObjectKey}`, 503, 'PROFILE_ASSETS_UNAVAILABLE'],
    ] as const) {
      const configured = setup({profileAssets: {createUploadIntent: vi.fn(), finalizeUpload: vi.fn(async () => {
        throw new Error(message)
      })}})
      const response = await configured.app.request(`/v1/me/assets/${assetId}/confirm`, {
        method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({assetId}),
      })
      await expectError(response, status, code)
      expect(await response.text()).not.toContain(stagingObjectKey)
      expect(configured.profiles.confirmProfileAsset).not.toHaveBeenCalled()
    }
  })

  it('maps profile write conflicts and unavailable asset selections safely', async () => {
    for (const [repositoryCode, status, responseCode] of [
      ['PROFILE_VERSION_CONFLICT', 409, 'PROFILE_VERSION_CONFLICT'],
      ['PROFILE_ASSET_UNAVAILABLE', 422, 'PROFILE_ASSET_UNAVAILABLE'],
    ] as const) {
      const {app} = setup({profiles: {updateCurrentAccount: vi.fn(async () => { throw {code: repositoryCode} })}})
      await expectError(await app.request('/v1/me', {
        method: 'PATCH', headers: {'content-type': 'application/json'},
        body: JSON.stringify({profileVersion: 3, avatarAssetId: assetId}),
      }), status, responseCode)
    }
  })
})
