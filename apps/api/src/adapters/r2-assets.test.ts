import {randomUUID} from 'node:crypto'
import {describe, expect, it, vi} from 'vitest'
import {createR2AssetPort, readR2AssetEnv} from './r2-assets.js'

const environment = {
  R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  R2_ACCESS_KEY_ID: 'access-key',
  R2_SECRET_ACCESS_KEY: 'secret-key',
  R2_PRIVATE_BUCKET: 'aifans-private',
}

describe('R2 private creator asset adapter', () => {
  it('requires complete server-only configuration and rejects malformed public endpoints', () => {
    expect(readR2AssetEnv({})).toBeNull()
    expect(() => readR2AssetEnv({R2_ACCOUNT_ID: environment.R2_ACCOUNT_ID})).toThrow('Invalid R2 asset environment')
    expect(readR2AssetEnv(environment)).toEqual({...environment, endpoint: `https://${environment.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`})
  })

  it('generates randomized private keys and short-lived content-type-bound upload intents', async () => {
    const sign = vi.fn(async () => 'https://signed.example/object')
    const inspect = vi.fn(async () => ({contentType: 'image/png', sizeBytes: 4096}))
    const port = createR2AssetPort(readR2AssetEnv(environment)!, {sign, inspect, now: () => new Date('2026-09-01T00:00:00.000Z')})
    const creatorProfileId = randomUUID(); const draftId = randomUUID()
    const intent = await port.createUploadIntent({creatorProfileId, draftId, contentType: 'image/png', sizeBytes: 4096})
    expect(intent).toMatchObject({method: 'PUT', headers: {'content-type': 'image/png'}, maxBytes: 10_485_760})
    expect(intent.expiresAt).toBe('2026-09-01T00:05:00.000Z')
    expect(sign).toHaveBeenCalledWith(expect.objectContaining({operation: 'put', bucket: 'aifans-private', key: expect.stringMatching(new RegExp(`^private/creator/${creatorProfileId}/${draftId}/[0-9a-f-]{36}\\.png$`)), contentType: 'image/png', expiresIn: 300}))
    expect(JSON.stringify(intent)).not.toContain('key')
  })

  it('enforces MIME and size boundaries before signing and after upload', async () => {
    const sign = vi.fn(async () => 'https://signed.example/object')
    const inspect = vi.fn(async () => ({contentType: 'image/png', sizeBytes: 10_485_761}))
    const port = createR2AssetPort(readR2AssetEnv(environment)!, {sign, inspect})
    const base = {creatorProfileId: randomUUID(), draftId: randomUUID()}
    await expect(port.createUploadIntent({...base, contentType: 'image/gif' as never, sizeBytes: 100})).rejects.toThrow('ASSET_INVALID')
    await expect(port.createUploadIntent({...base, contentType: 'image/png', sizeBytes: 10_485_761})).rejects.toThrow('ASSET_INVALID')
    await expect(port.inspectUpload({...base, assetId: randomUUID(), contentType: 'image/png'})).rejects.toThrow('ASSET_INVALID')
    expect(sign).not.toHaveBeenCalled()
  })

  it('creates only short-lived reads for a validated platform-derived key', async () => {
    const sign = vi.fn(async () => 'https://signed.example/read')
    const inspect = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({contentType: 'image/webp', sizeBytes: 4096})
    const port = createR2AssetPort(readR2AssetEnv(environment)!, {sign, inspect})
    const input = {creatorProfileId: randomUUID(), draftId: randomUUID(), assetId: randomUUID()}
    const intent = await port.createReadIntent(input)
    expect(intent).toMatchObject({method: 'GET', url: 'https://signed.example/read'})
    expect(sign).toHaveBeenCalledWith(expect.objectContaining({operation: 'get', key: `private/creator/${input.creatorProfileId}/${input.draftId}/${input.assetId}.webp`, expiresIn: 300}))
  })
})
