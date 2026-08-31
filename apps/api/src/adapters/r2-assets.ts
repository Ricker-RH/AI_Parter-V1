import {GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3'
import {getSignedUrl} from '@aws-sdk/s3-request-presigner'
import {z} from 'zod'
import {
  CREATOR_ASSET_INTENT_TTL_SECONDS,
  CREATOR_ASSET_MAX_BYTES,
  type AssetPort,
  type CreatorImageContentType,
} from '../ports/assets.js'

const contentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp'])
const uuid = z.uuid()
const locationSchema = z.strictObject({creatorProfileId: uuid, draftId: uuid})
const uploadSchema = locationSchema.extend({assetId: uuid, contentType: contentTypeSchema, sizeBytes: z.number().int().min(1).max(CREATOR_ASSET_MAX_BYTES), expiresAt: z.iso.datetime()}).strict()
const uploadedSchema = locationSchema.extend({assetId: uuid, contentType: contentTypeSchema, expectedSizeBytes: z.number().int().min(1).max(CREATOR_ASSET_MAX_BYTES)}).strict()
const objectLocationSchema = locationSchema.extend({assetId: uuid, contentType: contentTypeSchema}).strict()

export type R2AssetEnvironment = {
  R2_ACCOUNT_ID: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
  R2_PRIVATE_BUCKET: string
  endpoint: string
}

export type R2SignInput = {
  operation: 'put' | 'get'
  bucket: string
  key: string
  expiresIn: number
  contentType?: CreatorImageContentType
  contentLength?: number
}

type R2Dependencies = {
  sign(input: R2SignInput): Promise<string>
  inspect(input: {bucket: string; key: string}): Promise<{contentType?: string; sizeBytes?: number} | null>
  now?: () => Date
}

const configuredSchema = z.strictObject({
  R2_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/i),
  R2_ACCESS_KEY_ID: z.string().trim().min(1).max(512),
  R2_SECRET_ACCESS_KEY: z.string().trim().min(1).max(1024),
  R2_PRIVATE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
})
const readSchema = locationSchema.extend({assetId: uuid}).strict()
const contentTypes = contentTypeSchema.options

export function readR2AssetEnv(environment: Record<string, string | undefined>): R2AssetEnvironment | null {
  const raw = {
    R2_ACCOUNT_ID: environment.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: environment.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: environment.R2_SECRET_ACCESS_KEY,
    R2_PRIVATE_BUCKET: environment.R2_PRIVATE_BUCKET,
  }
  if (Object.values(raw).every((value) => value === undefined)) return null
  const result = configuredSchema.safeParse(raw)
  if (!result.success) throw new Error('Invalid R2 asset environment')
  return {...result.data, endpoint: `https://${result.data.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`}
}

function extension(contentType: CreatorImageContentType): string {
  return contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp'
}

function objectKey(input: {creatorProfileId: string; draftId: string; assetId: string; contentType: CreatorImageContentType}): string {
  const value = objectLocationSchema.parse({creatorProfileId: input.creatorProfileId, draftId: input.draftId, assetId: input.assetId, contentType: input.contentType})
  return `private/creator/${value.creatorProfileId}/${value.draftId}/${value.assetId}.${extension(value.contentType)}`
}

function expiry(now: () => Date): string {
  return new Date(now().getTime() + CREATOR_ASSET_INTENT_TTL_SECONDS * 1000).toISOString()
}

function awsDependencies(configuration: R2AssetEnvironment): R2Dependencies {
  const client = new S3Client({
    region: 'auto',
    endpoint: configuration.endpoint,
    credentials: {accessKeyId: configuration.R2_ACCESS_KEY_ID, secretAccessKey: configuration.R2_SECRET_ACCESS_KEY},
  })
  return {
    async sign(input) {
      const command = input.operation === 'put'
        ? new PutObjectCommand({Bucket: input.bucket, Key: input.key, ContentType: input.contentType, ContentLength: input.contentLength})
        : new GetObjectCommand({Bucket: input.bucket, Key: input.key})
      return getSignedUrl(client, command, {expiresIn: input.expiresIn})
    },
    async inspect(input) {
      try {
        const result = await client.send(new HeadObjectCommand({Bucket: input.bucket, Key: input.key}))
        return {
          ...(result.ContentType === undefined ? {} : {contentType: result.ContentType}),
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

export function createR2AssetPort(configuration: R2AssetEnvironment, dependencies?: R2Dependencies): AssetPort {
  const driver = dependencies ?? awsDependencies(configuration)
  const now = dependencies?.now ?? (() => new Date())
  return {
    async createUploadIntent(input) {
      let value: z.infer<typeof uploadSchema>
      try { value = uploadSchema.parse(input) } catch { throw new Error('ASSET_INVALID') }
      const remainingSeconds = Math.ceil((Date.parse(value.expiresAt) - now().getTime()) / 1000)
      if (remainingSeconds < 1 || remainingSeconds > CREATOR_ASSET_INTENT_TTL_SECONDS) throw new Error('ASSET_INVALID')
      const key = objectKey(value)
      const url = await driver.sign({operation: 'put', bucket: configuration.R2_PRIVATE_BUCKET, key, contentType: value.contentType, contentLength: value.sizeBytes, expiresIn: remainingSeconds})
      return {assetId: value.assetId, method: 'PUT', url, headers: {'content-type': value.contentType}, expiresAt: value.expiresAt, maxBytes: CREATOR_ASSET_MAX_BYTES}
    },
    async inspectUpload(input) {
      let value: z.infer<typeof uploadedSchema>
      try { value = uploadedSchema.parse(input) } catch { throw new Error('ASSET_INVALID') }
      const metadata = await driver.inspect({bucket: configuration.R2_PRIVATE_BUCKET, key: objectKey(value)})
      if (!metadata) throw new Error('ASSET_NOT_FOUND')
      if (metadata.contentType !== value.contentType || metadata.sizeBytes !== value.expectedSizeBytes) {
        throw new Error('ASSET_INVALID')
      }
      return {assetId: value.assetId, contentType: value.contentType, sizeBytes: metadata.sizeBytes!}
    },
    async createReadIntent(input) {
      let value: z.infer<typeof readSchema>
      try { value = readSchema.parse(input) } catch { throw new Error('ASSET_INVALID') }
      for (const contentType of contentTypes) {
        const candidate = {...value, contentType}
        const metadata = await driver.inspect({bucket: configuration.R2_PRIVATE_BUCKET, key: objectKey(candidate)})
        if (!metadata) continue
        if (metadata.contentType !== contentType || !Number.isInteger(metadata.sizeBytes) || metadata.sizeBytes! < 1 || metadata.sizeBytes! > CREATOR_ASSET_MAX_BYTES) throw new Error('ASSET_INVALID')
        const url = await driver.sign({operation: 'get', bucket: configuration.R2_PRIVATE_BUCKET, key: objectKey(candidate), expiresIn: CREATOR_ASSET_INTENT_TTL_SECONDS})
        return {method: 'GET', url, expiresAt: expiry(now)}
      }
      throw new Error('ASSET_NOT_FOUND')
    },
  }
}

export function r2AssetPortFromEnv(environment: Record<string, string | undefined> = process.env): AssetPort | undefined {
  const configuration = readR2AssetEnv(environment)
  return configuration ? createR2AssetPort(configuration) : undefined
}
