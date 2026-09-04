import type {ProfileAssetRole, ProfileImageContentType} from '@aifans/contracts'

export const PROFILE_ASSET_MAX_BYTES = 10_485_760 as const
export const PROFILE_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable' as const

export type ProfileAssetPort = {
  createUploadIntent(input: {
    stagingObjectKey: string
    finalObjectKey: string
    contentType: ProfileImageContentType
    sizeBytes: number
    expiresAt: string
  }): Promise<{
    method: 'PUT'
    url: string
    headers: {'content-type': ProfileImageContentType}
    expiresAt: string
    maxBytes: typeof PROFILE_ASSET_MAX_BYTES
  }>
  finalizeUpload(input: {
    stagingObjectKey: string
    finalObjectKey: string
    role: ProfileAssetRole
    contentType: ProfileImageContentType
    sizeBytes: number
    width: number
    height: number
  }): Promise<{
    finalObjectKey: string
    contentType: 'image/webp'
    sizeBytes: number
    width: number
    height: number
  }>
  cleanupStaging(input: {
    stagingObjectKey: string
    finalObjectKey: string
    contentType: ProfileImageContentType
    sizeBytes: number
  }): Promise<void>
}
