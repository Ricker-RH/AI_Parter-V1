import type {Account} from '@aifans/contracts'
import type {Actor, EnsureHumanProfileInput} from '@aifans/db'
import type {
  ProfileAssetIntentRequest,
  ProfileAssetRole,
  ProfileImageContentType,
  UpdateCurrentAccount,
} from '@aifans/contracts'

export type ProfileAssetReservation = {
  id: string
  ownerProfileId: string
  role: ProfileAssetRole
  objectKey: string
  contentType: ProfileImageContentType
  sizeBytes: number
  width: number
  height: number
  expiresAt: string
  verifiedAt: string | null
}

export type ProfilePort = {
  ensureHumanProfile(input: EnsureHumanProfileInput): Promise<unknown>
  getCurrentAccount(actor: Actor | null): Promise<Account | null>
  updateCurrentAccount?(actor: Actor | null, input: UpdateCurrentAccount): Promise<Account | null>
  reserveProfileAsset?(actor: Actor, input: ProfileAssetIntentRequest): Promise<ProfileAssetReservation>
  getProfileAssetReservation?(actor: Actor, assetId: string): Promise<ProfileAssetReservation | null>
  confirmProfileAsset?(actor: Actor, assetId: string): Promise<ProfileAssetReservation | null>
}
