export const CREATOR_ASSET_MAX_BYTES = 10_485_760
export const CREATOR_ASSET_INTENT_TTL_SECONDS = 300

export type CreatorImageContentType = 'image/jpeg' | 'image/png' | 'image/webp'

type OwnedAssetLocation = {
  creatorProfileId: string
  draftId: string
}

export type CreateUploadIntentInput = OwnedAssetLocation & {
  assetId: string
  contentType: CreatorImageContentType
  sizeBytes: number
  expiresAt: string
}

export type UploadedAssetInput = OwnedAssetLocation & {
  assetId: string
  contentType: CreatorImageContentType
  expectedSizeBytes: number
}

export type ReadAssetInput = OwnedAssetLocation & {assetId: string}

export type AssetUploadIntent = {
  assetId: string
  method: 'PUT'
  url: string
  headers: {'content-type': CreatorImageContentType}
  expiresAt: string
  maxBytes: number
}

export type AssetReadIntent = {
  method: 'GET'
  url: string
  expiresAt: string
}

export type AssetPort = {
  createUploadIntent(input: CreateUploadIntentInput): Promise<AssetUploadIntent>
  inspectUpload(input: UploadedAssetInput): Promise<{assetId: string; contentType: CreatorImageContentType; sizeBytes: number}>
  createReadIntent(input: ReadAssetInput): Promise<AssetReadIntent>
}

export type ImageGenerationPort = {
  createGenerationIntent(input: {actorSubject: string; creatorProfileId: string; draftId: string; requestId: string}): Promise<ImageGenerationIntent>
}

export type ImageGenerationIntent = {
  jobId: string
  status: 'queued' | 'ready'
  candidates: Array<{id: string; readIntent: AssetReadIntent}>
}
