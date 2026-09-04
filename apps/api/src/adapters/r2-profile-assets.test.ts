import {randomUUID} from 'node:crypto'
import {describe, expect, it, vi} from 'vitest'
import {createR2ProfileAssetPort} from './r2-profile-assets.js'

const configuration = {
  accountId: '0'.repeat(32),
  accessKeyId: 'access',
  secretAccessKey: 'secret',
  bucket: 'public-media',
  publicBaseUrl: 'https://media.example',
  endpoint: 'https://r2.example',
}

function validInput(overrides: Record<string, unknown> = {}) {
  const profileId = randomUUID()
  const assetId = randomUUID()
  return {
    objectKey: `public/profiles/${profileId}/avatar/${assetId}.png`,
    contentType: 'image/png' as const,
    sizeBytes: 4_096,
    expiresAt: '2026-09-04T00:05:00.000Z',
    ...overrides,
  }
}

describe('R2 public profile asset adapter', () => {
  it('signs only canonical profile keys with exact content type, length, and a bounded expiry', async () => {
    const sign = vi.fn(async () => 'https://signed.example/upload')
    const port = createR2ProfileAssetPort(configuration, {
      sign,
      inspect: vi.fn(),
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    })
    const input = validInput()

    await expect(port.createUploadIntent(input)).resolves.toEqual({
      method: 'PUT',
      url: 'https://signed.example/upload',
      headers: {'content-type': 'image/png'},
      expiresAt: input.expiresAt,
      maxBytes: 10_485_760,
    })
    expect(sign).toHaveBeenCalledWith({
      bucket: 'public-media',
      key: input.objectKey,
      contentType: 'image/png',
      contentLength: 4_096,
      expiresIn: 300,
    })
  })

  it.each([
    {objectKey: `public/profiles/${randomUUID()}/avatar/not-a-uuid.png`},
    {objectKey: `public/profiles/${randomUUID()}/portrait/${randomUUID()}.png`},
    {objectKey: `private/profiles/${randomUUID()}/avatar/${randomUUID()}.png`},
    {objectKey: `public/profiles/${randomUUID()}/avatar/${randomUUID()}.gif`},
    {objectKey: `public/profiles/${randomUUID()}/avatar/${randomUUID()}.jpg`, contentType: 'image/png'},
    {contentType: 'image/gif'},
    {sizeBytes: 0},
    {sizeBytes: 10_485_761},
    {sizeBytes: 1.5},
    {expiresAt: '2026-09-04T00:00:00.000Z'},
    {expiresAt: '2026-09-04T00:10:01.000Z'},
  ])('rejects an invalid signing input without calling the signer: %o', async (override) => {
    const sign = vi.fn()
    const port = createR2ProfileAssetPort(configuration, {
      sign,
      inspect: vi.fn(),
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    })
    await expect(port.createUploadIntent(validInput(override))).rejects.toThrow('PROFILE_ASSET_INVALID')
    expect(sign).not.toHaveBeenCalled()
  })

  it('HEAD-verifies the exact stored content type and length', async () => {
    const input = validInput()
    const inspect = vi.fn(async () => ({contentType: input.contentType, sizeBytes: input.sizeBytes}))
    const port = createR2ProfileAssetPort(configuration, {sign: vi.fn(), inspect})

    await expect(port.inspectUpload(input)).resolves.toEqual({
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    })
    expect(inspect).toHaveBeenCalledWith({bucket: 'public-media', key: input.objectKey})
  })

  it.each([
    [null, 'PROFILE_ASSET_NOT_FOUND'],
    [{contentType: 'image/jpeg', sizeBytes: 4_096}, 'PROFILE_ASSET_INVALID'],
    [{contentType: 'image/png', sizeBytes: 4_095}, 'PROFILE_ASSET_INVALID'],
    [{contentType: undefined, sizeBytes: 4_096}, 'PROFILE_ASSET_INVALID'],
    [{contentType: 'image/png', sizeBytes: undefined}, 'PROFILE_ASSET_INVALID'],
  ])('rejects missing or mismatched HEAD metadata', async (metadata, code) => {
    const port = createR2ProfileAssetPort(configuration, {
      sign: vi.fn(),
      inspect: vi.fn(async () => metadata),
    })
    await expect(port.inspectUpload(validInput())).rejects.toThrow(code)
  })
})
