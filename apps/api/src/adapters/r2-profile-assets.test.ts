import {randomUUID} from 'node:crypto'
import {GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3'
import sharp from 'sharp'
import {describe, expect, it, vi} from 'vitest'
import {createR2ProfileAssetPort, createR2ProfileAssetCleanup} from './r2-profile-assets.js'

const configuration = {
  accountId: '0'.repeat(32), accessKeyId: 'access', secretAccessKey: 'secret',
  bucket: 'public-media', publicBaseUrl: 'https://media.example', endpoint: 'https://r2.example',
}

function keys(role: 'avatar' | 'background' = 'avatar', extension = 'png') {
  const profileId = randomUUID(), assetId = randomUUID()
  return {
    stagingObjectKey: `staging/profiles/${profileId}/${role}/${assetId}.${extension}`,
    finalObjectKey: `public/profiles/${profileId}/${role}/${assetId}.webp`,
  }
}

function intentInput(overrides: Record<string, unknown> = {}) {
  return {...keys(), contentType: 'image/png' as const, sizeBytes: 4_096,
    expiresAt: '2026-09-04T00:05:00.000Z', ...overrides}
}

function driver(overrides: Record<string, unknown> = {}) {
  return {
    sign: vi.fn(async () => 'https://signed.example/upload'), inspect: vi.fn(async () => null), read: vi.fn(),
    write: vi.fn(), delete: vi.fn(), now: () => new Date('2026-09-04T00:00:00.000Z'),
    ...overrides,
  }
}

describe('R2 public profile asset adapter', () => {
  it('cleanup accepts only exact canonical profile keys and never broad prefixes or other assets', async () => {
    const dependencies = driver()
    const remove = createR2ProfileAssetCleanup(configuration, dependencies)
    const value = keys()
    await remove(value.stagingObjectKey)
    await remove(value.finalObjectKey)
    expect(dependencies.delete).toHaveBeenCalledTimes(2)
    for (const key of ['public/profiles/', 'public/posts/x.webp', '../public/profiles/x', '']) {
      await expect(remove(key)).rejects.toThrow('PROFILE_ASSET_INVALID')
    }
    expect(dependencies.delete).toHaveBeenCalledTimes(2)
  })
  it('uses the real AWS presigner without binding an empty-body checksum', async () => {
    const expiresAt = new Date(Date.now() + 300_000).toISOString()
    const intent = await createR2ProfileAssetPort(configuration).createUploadIntent(intentInput({expiresAt}))
    const url = new URL(intent.url)
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(url.searchParams.get('x-amz-checksum-crc32')).toBeNull()
    expect(url.searchParams.get('x-amz-sdk-checksum-algorithm')).toBeNull()
    const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? []
    expect(signedHeaders).toContain('content-length')
    expect(signedHeaders).not.toContain('content-type')
    expect(intent.headers).toEqual({'content-type': 'image/png'})
  })

  it('signs only canonical staging keys with exact content length and bounded expiry', async () => {
    const dependencies = driver(), port = createR2ProfileAssetPort(configuration, dependencies)
    const input = intentInput()
    await expect(port.createUploadIntent(input)).resolves.toEqual({method: 'PUT', url: 'https://signed.example/upload',
      headers: {'content-type': 'image/png'}, expiresAt: input.expiresAt, maxBytes: 10_485_760})
    expect(dependencies.sign).toHaveBeenCalledWith({bucket: 'public-media', key: input.stagingObjectKey,
      contentType: 'image/png', contentLength: 4_096, expiresIn: 300})
  })

  it.each([
    {stagingObjectKey: `public/profiles/${randomUUID()}/avatar/${randomUUID()}.png`},
    {stagingObjectKey: `staging/profiles/${randomUUID()}/avatar/not-a-uuid.png`},
    {stagingObjectKey: `staging/profiles/${randomUUID()}/portrait/${randomUUID()}.png`},
    {stagingObjectKey: `staging/profiles/${randomUUID()}/avatar/${randomUUID()}.gif`},
    {stagingObjectKey: `staging/profiles/${randomUUID()}/avatar/${randomUUID()}.jpg`, contentType: 'image/png'},
    {finalObjectKey: `staging/profiles/${randomUUID()}/avatar/${randomUUID()}.webp`},
    {contentType: 'image/gif'}, {sizeBytes: 0}, {sizeBytes: 10_485_761}, {sizeBytes: 1.5},
    {expiresAt: '2026-09-04T00:00:00.000Z'}, {expiresAt: '2026-09-04T00:10:01.000Z'},
  ])('rejects an invalid signing input without calling the signer: %o', async (override) => {
    const dependencies = driver(), port = createR2ProfileAssetPort(configuration, dependencies)
    await expect(port.createUploadIntent(intentInput(override))).rejects.toThrow('PROFILE_ASSET_INVALID')
    expect(dependencies.sign).not.toHaveBeenCalled()
  })

  it('decodes, rotates, strips metadata, and normalizes an avatar without deleting staging', async () => {
    const source = await sharp({create: {width: 600, height: 800, channels: 3, background: '#5271ff'}})
      .jpeg().withMetadata({orientation: 6}).toBuffer()
    const inputKeys = keys('avatar', 'jpg'), calls: string[] = []
    let finalBytes: Buffer | undefined
    const dependencies = driver({
      read: vi.fn(async () => { calls.push('read'); return (async function* () {
        yield source.subarray(0, 64); yield source.subarray(64)
      })() }),
      write: vi.fn(async (input: {body: Uint8Array}) => { calls.push('write'); finalBytes = Buffer.from(input.body) }),
      delete: vi.fn(async () => { calls.push('delete') }),
    })
    const port = createR2ProfileAssetPort(configuration, dependencies)
    await expect(port.finalizeUpload({...inputKeys, role: 'avatar', contentType: 'image/jpeg',
      sizeBytes: source.length, width: 800, height: 600})).resolves.toEqual({
      finalObjectKey: inputKeys.finalObjectKey, contentType: 'image/webp', width: 512, height: 512,
      sizeBytes: expect.any(Number),
    })
    expect(calls).toEqual(['read', 'write'])
    expect(dependencies.write).toHaveBeenCalledWith({bucket: 'public-media', key: inputKeys.finalObjectKey,
      body: expect.any(Uint8Array), contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable', ifNoneMatch: '*'})
    expect(dependencies.delete).not.toHaveBeenCalled()
    const metadata = await sharp(finalBytes!).metadata()
    expect(metadata).toMatchObject({format: 'webp', width: 512, height: 512})
    expect(metadata.orientation).toBeUndefined()
    expect(metadata.exif).toBeUndefined()
  })

  it('fits a background inside 2400x1600 without baking a focal crop', async () => {
    const source = await sharp({create: {width: 3000, height: 1000, channels: 3, background: '#222222'}}).png().toBuffer()
    const inputKeys = keys('background'); let finalBytes: Buffer | undefined
    const port = createR2ProfileAssetPort(configuration, driver({read: vi.fn(async () => source),
      write: vi.fn(async (input: {body: Uint8Array}) => { finalBytes = Buffer.from(input.body) }),
      delete: vi.fn(async () => undefined)}))
    await port.finalizeUpload({...inputKeys, role: 'background', contentType: 'image/png',
      sizeBytes: source.length, width: 3000, height: 1000})
    await expect(sharp(finalBytes!).metadata()).resolves.toMatchObject({format: 'webp', width: 2400, height: 800})
  })

  it.each([
    ['corrupt bytes', Buffer.from('not an image'), 100, 100],
    ['declared dimensions do not match decoded dimensions', null, 200, 200],
  ])('rejects %s without publishing or deleting staging', async (_name, bytes, width, height) => {
    const source = bytes ?? await sharp({create: {width: 100, height: 100, channels: 3, background: '#000000'}}).png().toBuffer()
    const dependencies = driver({read: vi.fn(async () => source)})
    const port = createR2ProfileAssetPort(configuration, dependencies)
    await expect(port.finalizeUpload({...keys(), role: 'avatar', contentType: 'image/png',
      sizeBytes: source.length, width, height})).rejects.toThrow('PROFILE_ASSET_INVALID')
    expect(dependencies.write).not.toHaveBeenCalled(); expect(dependencies.delete).not.toHaveBeenCalled()
  })

  it('enforces the byte declaration while collecting the staging stream', async () => {
    const dependencies = driver({read: vi.fn(async () => (async function* () { yield Buffer.alloc(6); yield Buffer.alloc(5) })())})
    await expect(createR2ProfileAssetPort(configuration, dependencies).finalizeUpload({...keys(), role: 'avatar',
      contentType: 'image/png', sizeBytes: 10, width: 100, height: 100})).rejects.toThrow('PROFILE_ASSET_INVALID')
    expect(dependencies.write).not.toHaveBeenCalled()
  })

  it('retries from an existing final object when staging is absent without recreating it', async () => {
    const source = await sharp({create: {width: 512, height: 512, channels: 3, background: '#ef4444'}}).png().toBuffer()
    const inputKeys = keys(), store = new Map<string, Buffer>([[inputKeys.stagingObjectKey, source]])
    const port = createR2ProfileAssetPort(configuration, driver({
      inspect: vi.fn(async ({key}: {key: string}) => store.has(key)
        ? {contentType: 'image/webp', sizeBytes: store.get(key)!.length}
        : null),
      read: vi.fn(async ({key}: {key: string}) => store.get(key)),
      write: vi.fn(async ({key, body, ifNoneMatch}: {key: string; body: Uint8Array; ifNoneMatch: string}) => {
        expect(ifNoneMatch).toBe('*')
        if (store.has(key)) throw Object.assign(new Error('already exists'), {
          name: 'PreconditionFailed', $metadata: {httpStatusCode: 412},
        })
        store.set(key, Buffer.from(body))
      }),
      delete: vi.fn(async ({key}: {key: string}) => { store.delete(key) }),
    }))
    await port.finalizeUpload({...inputKeys, role: 'avatar', contentType: 'image/png',
      sizeBytes: source.length, width: 512, height: 512})
    const published = Buffer.from(store.get(inputKeys.finalObjectKey)!)
    store.delete(inputKeys.stagingObjectKey)
    await expect(port.finalizeUpload({...inputKeys, role: 'avatar', contentType: 'image/png',
      sizeBytes: source.length, width: 512, height: 512})).resolves.toMatchObject({
      finalObjectKey: inputKeys.finalObjectKey, contentType: 'image/webp',
    })
    expect(store.get(inputKeys.finalObjectKey)).toEqual(published)
    await expect(sharp(store.get(inputKeys.finalObjectKey)!).metadata()).resolves.toMatchObject({format: 'webp'})
  })

  it('lets concurrent finalizations recover from a conditional-create race', async () => {
    const source = await sharp({create: {width: 512, height: 512, channels: 3, background: '#10b981'}}).png().toBuffer()
    let created = false
    const dependencies = driver({
      read: vi.fn(async () => source),
      write: vi.fn(async () => {
        if (created) throw Object.assign(new Error('already exists'), {$metadata: {httpStatusCode: 412}})
        created = true
      }),
      delete: vi.fn(async () => undefined),
    })
    const port = createR2ProfileAssetPort(configuration, dependencies)
    const input = {...keys(), role: 'avatar' as const, contentType: 'image/png' as const,
      sizeBytes: source.length, width: 512, height: 512}
    await expect(Promise.all([port.finalizeUpload(input), port.finalizeUpload(input)])).resolves.toHaveLength(2)
    expect(dependencies.write).toHaveBeenCalledTimes(2)
    expect(dependencies.delete).not.toHaveBeenCalled()
  })

  it('sets If-None-Match on the real AWS final PutObject command', async () => {
    const source = await sharp({create: {width: 512, height: 512, channels: 3, background: '#f59e0b'}}).png().toBuffer()
    const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
      if (command instanceof HeadObjectCommand) throw Object.assign(new Error('missing'), {$metadata: {httpStatusCode: 404}})
      if (command instanceof GetObjectCommand) return {Body: source} as never
      return {} as never
    })
    try {
      const inputKeys = keys()
      await createR2ProfileAssetPort(configuration).finalizeUpload({...inputKeys, role: 'avatar',
        contentType: 'image/png', sizeBytes: source.length, width: 512, height: 512})
      const put = send.mock.calls.map(([command]) => command)
        .find((command) => command instanceof PutObjectCommand) as PutObjectCommand | undefined
      expect(put?.input).toMatchObject({Key: inputKeys.finalObjectKey, IfNoneMatch: '*'})
    } finally {
      send.mockRestore()
    }
  })

  it('cleans staging only when explicitly requested', async () => {
    const inputKeys = keys()
    const dependencies = driver({delete: vi.fn(async () => undefined)})
    await createR2ProfileAssetPort(configuration, dependencies).cleanupStaging({
      stagingObjectKey: inputKeys.stagingObjectKey,
      finalObjectKey: inputKeys.finalObjectKey,
      contentType: 'image/png',
      sizeBytes: 4_096,
    })
    expect(dependencies.delete).toHaveBeenCalledWith({bucket: 'public-media', key: inputKeys.stagingObjectKey})
  })
})
