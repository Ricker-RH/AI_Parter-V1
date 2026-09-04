import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import {getSignedUrl} from '@aws-sdk/s3-request-presigner'
import {ProfileImageContentTypeSchema, ProfileAssetRoleSchema, type ProfileImageContentType} from '@aifans/contracts'
import sharp from 'sharp'
import type {R2PostMediaEnvironment} from './r2-post-media.js'
import {
  PROFILE_ASSET_CACHE_CONTROL,
  PROFILE_ASSET_MAX_BYTES,
  type ProfileAssetPort,
} from '../ports/profile-assets.js'

type Driver = {
  sign(input: {bucket: string; key: string; contentType: string; contentLength: number; expiresIn: number}): Promise<string>
  read(input: {bucket: string; key: string}): Promise<unknown | null>
  write(input: {bucket: string; key: string; body: Uint8Array; contentType: 'image/webp'; cacheControl: string}): Promise<void>
  delete(input: {bucket: string; key: string}): Promise<void>
  now?: () => Date
}

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const stagingKey = new RegExp(`^staging/profiles/(${uuid})/(avatar|background)/(${uuid})\\.(jpg|png|webp)$`)
const finalKey = new RegExp(`^public/profiles/(${uuid})/(avatar|background)/(${uuid})\\.webp$`)
const extensionFor: Record<ProfileImageContentType, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
}
const formatFor: Record<ProfileImageContentType, 'jpeg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp',
}

function invalid(): never { throw new Error('PROFILE_ASSET_INVALID') }
function unavailable(): never { throw new Error('PROFILE_ASSET_STORAGE_UNAVAILABLE') }
function isProfileError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('PROFILE_ASSET_')
}

function validateKeys(input: {
  stagingObjectKey: string
  finalObjectKey: string
  contentType: ProfileImageContentType
  sizeBytes: number
}) {
  const contentType = ProfileImageContentTypeSchema.safeParse(input.contentType)
  const staging = stagingKey.exec(input.stagingObjectKey)
  const final = finalKey.exec(input.finalObjectKey)
  if (!contentType.success || !staging || !final) invalid()
  if (staging[4] !== extensionFor[contentType.data]) invalid()
  if (staging[1] !== final[1] || staging[2] !== final[2] || staging[3] !== final[3]) invalid()
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > PROFILE_ASSET_MAX_BYTES) invalid()
  return {contentType: contentType.data}
}

async function collectBounded(body: unknown, maximumBytes: number): Promise<Buffer> {
  if (body instanceof Uint8Array) {
    if (body.byteLength > maximumBytes) invalid()
    return Buffer.from(body)
  }
  if (!body || typeof body !== 'object' || !(Symbol.asyncIterator in body)) invalid()
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array)) invalid()
    length += chunk.byteLength
    if (length > maximumBytes) invalid()
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks, length)
}

function statusCode(error: unknown): unknown {
  return error && typeof error === 'object' && '$metadata' in error
    ? (error.$metadata as {httpStatusCode?: unknown}).httpStatusCode
    : undefined
}

function awsDriver(configuration: R2PostMediaEnvironment): Driver {
  const client = new S3Client({
    region: 'auto', endpoint: configuration.endpoint,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey},
  })
  return {
    sign: (input) => getSignedUrl(client, new PutObjectCommand({Bucket: input.bucket, Key: input.key,
      ContentType: input.contentType, ContentLength: input.contentLength}), {expiresIn: input.expiresIn}),
    async read(input) {
      try {
        return (await client.send(new GetObjectCommand({Bucket: input.bucket, Key: input.key}))).Body ?? null
      } catch (error) {
        if (statusCode(error) === 404) return null
        throw error
      }
    },
    async write(input) {
      await client.send(new PutObjectCommand({Bucket: input.bucket, Key: input.key, Body: input.body,
        ContentType: input.contentType, CacheControl: input.cacheControl}))
    },
    async delete(input) {
      await client.send(new DeleteObjectCommand({Bucket: input.bucket, Key: input.key}))
    },
  }
}

export function createR2ProfileAssetPort(configuration: R2PostMediaEnvironment, dependencies?: Driver): ProfileAssetPort {
  const driver = dependencies ?? awsDriver(configuration)
  const now = driver.now ?? (() => new Date())
  return {
    async createUploadIntent(input) {
      const value = validateKeys(input)
      const expiresIn = Math.ceil((Date.parse(input.expiresAt) - now().getTime()) / 1_000)
      if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 600) invalid()
      try {
        return {method: 'PUT', url: await driver.sign({bucket: configuration.bucket,
          key: input.stagingObjectKey, contentType: value.contentType,
          contentLength: input.sizeBytes, expiresIn}), headers: {'content-type': value.contentType},
          expiresAt: input.expiresAt, maxBytes: PROFILE_ASSET_MAX_BYTES}
      } catch (error) {
        if (isProfileError(error)) throw error
        unavailable()
      }
    },
    async finalizeUpload(input) {
      const value = validateKeys(input)
      const role = ProfileAssetRoleSchema.safeParse(input.role)
      if (!role.success || role.data !== stagingKey.exec(input.stagingObjectKey)?.[2]) invalid()
      if (!Number.isInteger(input.width) || input.width < 64 || input.width > 12_000
        || !Number.isInteger(input.height) || input.height < 64 || input.height > 12_000) invalid()

      let source: Buffer
      try {
        const body = await driver.read({bucket: configuration.bucket, key: input.stagingObjectKey})
        if (body === null || body === undefined) throw new Error('PROFILE_ASSET_NOT_FOUND')
        source = await collectBounded(body, PROFILE_ASSET_MAX_BYTES)
      } catch (error) {
        if (isProfileError(error)) throw error
        unavailable()
      }
      if (source.length !== input.sizeBytes) invalid()

      let normalized: Buffer
      let outputWidth: number
      let outputHeight: number
      try {
        const metadata = await sharp(source, {failOn: 'warning', limitInputPixels: 144_000_000}).metadata()
        const swapsAxes = metadata.orientation !== undefined && [5, 6, 7, 8].includes(metadata.orientation)
        const decodedWidth = swapsAxes ? metadata.height : metadata.width
        const decodedHeight = swapsAxes ? metadata.width : metadata.height
        if (metadata.format !== formatFor[value.contentType]
          || decodedWidth !== input.width || decodedHeight !== input.height) invalid()
        const transformed = sharp(source, {failOn: 'warning', limitInputPixels: 144_000_000}).rotate()
        const result = role.data === 'avatar'
          ? await transformed.resize(512, 512, {fit: 'cover', position: 'centre'}).webp().toBuffer({resolveWithObject: true})
          : await transformed.resize({width: 2400, height: 1600, fit: 'inside', withoutEnlargement: true})
              .webp().toBuffer({resolveWithObject: true})
        normalized = result.data
        outputWidth = result.info.width
        outputHeight = result.info.height
        if (normalized.length > PROFILE_ASSET_MAX_BYTES) invalid()
      } catch (error) {
        if (isProfileError(error)) throw error
        invalid()
      }

      try {
        await driver.write({bucket: configuration.bucket, key: input.finalObjectKey, body: normalized,
          contentType: 'image/webp', cacheControl: PROFILE_ASSET_CACHE_CONTROL})
        await driver.delete({bucket: configuration.bucket, key: input.stagingObjectKey})
      } catch (error) {
        if (isProfileError(error)) throw error
        unavailable()
      }
      return {finalObjectKey: input.finalObjectKey, contentType: 'image/webp', sizeBytes: normalized.length,
        width: outputWidth, height: outputHeight}
    },
  }
}
