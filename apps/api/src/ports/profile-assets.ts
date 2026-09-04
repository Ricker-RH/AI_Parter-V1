import type {ProfileImageContentType} from '@aifans/contracts'

export const PROFILE_ASSET_MAX_BYTES = 10_485_760 as const

export type ProfileAssetPort = {
  createUploadIntent(input: {
    objectKey: string
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
  inspectUpload(input: {
    objectKey: string
    contentType: ProfileImageContentType
    sizeBytes: number
  }): Promise<{contentType: ProfileImageContentType; sizeBytes: number}>
}
