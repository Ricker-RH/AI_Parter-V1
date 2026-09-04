import {HeadObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3'
import {getSignedUrl} from '@aws-sdk/s3-request-presigner'
import {ProfileImageContentTypeSchema, type ProfileImageContentType} from '@aifans/contracts'
import type {R2PostMediaEnvironment} from './r2-post-media.js'
import {PROFILE_ASSET_MAX_BYTES, type ProfileAssetPort} from '../ports/profile-assets.js'

type Driver = {
  sign(input: {
    bucket: string
    key: string
    contentType: string
    contentLength: number
    expiresIn: number
  }): Promise<string>
  inspect(input: {
    bucket: string
    key: string
  }): Promise<{contentType?: string; sizeBytes?: number} | null>
  now?: () => Date
}

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const profileKey = new RegExp(`^public/profiles/${uuid}/(avatar|background)/${uuid}\\.(jpg|png|webp)$`)
const extensionFor: Record<ProfileImageContentType, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function invalid(): never {
  throw new Error('PROFILE_ASSET_INVALID')
}

function validatedUpload(input: {
  objectKey: string
  contentType: ProfileImageContentType
  sizeBytes: number
}) {
  const contentType = ProfileImageContentTypeSchema.safeParse(input.contentType)
  const match = profileKey.exec(input.objectKey)
  if (!contentType.success || !match || match[2] !== extensionFor[contentType.data]) invalid()
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > PROFILE_ASSET_MAX_BYTES) invalid()
  return {key: input.objectKey, contentType: contentType.data, sizeBytes: input.sizeBytes}
}

function awsDriver(configuration: R2PostMediaEnvironment): Driver {
  const client = new S3Client({
    region: 'auto',
    endpoint: configuration.endpoint,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
  })
  return {
    sign: (input) => getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.contentLength,
      }),
      {expiresIn: input.expiresIn},
    ),
    async inspect(input) {
      try {
        const result = await client.send(new HeadObjectCommand({Bucket: input.bucket, Key: input.key}))
        return {
          ...(result.ContentType ? {contentType: result.ContentType} : {}),
          ...(result.ContentLength === undefined ? {} : {sizeBytes: result.ContentLength}),
        }
      } catch (error) {
        const status = error && typeof error === 'object' && '$metadata' in error
          ? (error.$metadata as {httpStatusCode?: unknown}).httpStatusCode
          : undefined
        if (status === 404) return null
        throw error
      }
    },
  }
}

export function createR2ProfileAssetPort(
  configuration: R2PostMediaEnvironment,
  dependencies?: Driver,
): ProfileAssetPort {
  const driver = dependencies ?? awsDriver(configuration)
  const now = driver.now ?? (() => new Date())
  return {
    async createUploadIntent(input) {
      const value = validatedUpload(input)
      const expiresIn = Math.ceil((Date.parse(input.expiresAt) - now().getTime()) / 1_000)
      if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 600) invalid()
      return {
        method: 'PUT',
        url: await driver.sign({
          bucket: configuration.bucket,
          key: value.key,
          contentType: value.contentType,
          contentLength: value.sizeBytes,
          expiresIn,
        }),
        headers: {'content-type': value.contentType},
        expiresAt: input.expiresAt,
        maxBytes: PROFILE_ASSET_MAX_BYTES,
      }
    },
    async inspectUpload(input) {
      const value = validatedUpload(input)
      const metadata = await driver.inspect({bucket: configuration.bucket, key: value.key})
      if (!metadata) throw new Error('PROFILE_ASSET_NOT_FOUND')
      if (metadata.contentType !== value.contentType || metadata.sizeBytes !== value.sizeBytes) invalid()
      return {contentType: value.contentType, sizeBytes: value.sizeBytes}
    },
  }
}
