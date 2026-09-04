import {randomUUID} from 'node:crypto'
import {Pool} from '@neondatabase/serverless'
import {
  AccountSchema,
  ProfileAssetIntentRequestSchema,
  type Account,
  type ProfileAssetIntentRequest,
  type ProfileAssetRole,
  type ProfileImageContentType,
  type UpdateCurrentAccount,
} from '@aifans/contracts'
import {
  type Actor,
  type QueryPool,
  type WithActor,
  withActor,
} from './session.js'

export type CurrentAccount = Account

export type HumanProfile = CurrentAccount & {
  authSubject: string
  accountKind: 'human'
}

export type EnsureHumanProfileInput = {
  authSubject: string
  email?: string | null
  displayName?: string | null
}

type ProfileRow = {
  id: string
  auth_subject: string
  account_kind: 'human' | 'ip'
  username: string
  display_name: string
  preferred_locale: 'en' | 'zh-CN'
  creator_mode_enabled: boolean
  avatar_object_key: string | null
  background_type: 'color' | 'image'
  background_color_key: 'paper' | 'sand' | 'mist' | 'sage' | 'sky' | 'lilac' | 'graphite'
  background_object_key: string | null
  background_focal_x: number | string
  background_focal_y: number | string
  profile_version: number | string
}

type CurrentAccountRow = {
  current_account: unknown
  bio?: string | null
}

type ProfileAssetReservationRow = {
  asset_id: string
  owner_profile_id: string
  role: ProfileAssetRole
  staging_object_key: string
  final_object_key: string
  upload_content_type: ProfileImageContentType
  final_content_type: 'image/webp'
  size_bytes: number
  width: number
  height: number
  expires_at: Date | string
  verified_at: Date | string | null
}

export type ProfileAssetReservation = {
  id: string
  ownerProfileId: string
  role: ProfileAssetRole
  stagingObjectKey: string
  finalObjectKey: string
  uploadContentType: ProfileImageContentType
  finalContentType: 'image/webp'
  sizeBytes: number
  width: number
  height: number
  expiresAt: string
  verifiedAt: string | null
}

export type ProfileRepository = {
  ensureHumanProfile(input: EnsureHumanProfileInput): Promise<HumanProfile>
  getCurrentAccount(actor: Actor | null): Promise<CurrentAccount | null>
  reserveProfileAsset(actor: Actor, input: ProfileAssetIntentRequest): Promise<ProfileAssetReservation>
  getProfileAssetReservation(actor: Actor, assetId: string): Promise<ProfileAssetReservation | null>
  confirmProfileAsset(actor: Actor, assetId: string, finalObjectKey: string): Promise<ProfileAssetReservation | null>
  updateCurrentAccount(actor: Actor | null, input: UpdateCurrentAccount): Promise<CurrentAccount | null>
}

export class ProfileRepositoryError extends Error {
  constructor(readonly code: 'PROFILE_VERSION_CONFLICT' | 'PROFILE_ASSET_UNAVAILABLE') {
    super(code)
    this.name = 'ProfileRepositoryError'
  }
}

function requireProvisioningUrl(): string {
  const value = process.env.DATABASE_PROVISIONING_URL
  try {
    const {protocol} = new URL(value ?? '')
    if (protocol === 'postgres:' || protocol === 'postgresql:') return value!
  } catch {
    // Fall through to the single redacted error below.
  }
  throw new Error('DATABASE_PROVISIONING_URL must be a valid postgres URL')
}

function candidateUsername(): string {
  return `user_${randomUUID().replaceAll('-', '').slice(0, 25)}`
}

function firstNonBlank(values: Array<string | null | undefined>): string | undefined {
  return values.find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  )?.trim()
}

function displayNameFor(input: EnsureHumanProfileInput): string {
  const emailLocalPart = input.email?.trim().split('@')[0]?.trim()
  return (firstNonBlank([input.displayName, emailLocalPart, 'AIFANS User']) ?? 'AIFANS User').slice(0, 80)
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function normalizePublicMediaBaseUrl(value?: string): string | undefined {
  if (!value) return undefined
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.search
    || url.hash) {
    throw new Error('INVALID_PUBLIC_MEDIA_BASE_URL')
  }
  return value.endsWith('/') ? value : `${value}/`
}

function profileMediaUrl(
  baseUrl: string | undefined,
  objectKey: string | null,
  profileId: string,
  role: ProfileAssetRole,
): string | null {
  if (objectKey === null) return null
  const escapedProfileId = profileId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const keyPattern = new RegExp(
    `^public/profiles/${escapedProfileId}/${role}/[0-9a-f-]+\\.webp$`,
  )
  if (!keyPattern.test(objectKey)) throw new Error('INVALID_PUBLIC_MEDIA_KEY')
  if (!baseUrl) throw new Error('PUBLIC_MEDIA_BASE_URL_REQUIRED')
  return new URL(objectKey, baseUrl).toString()
}

function accountBackground(row: ProfileRow, baseUrl?: string): Account['background'] {
  if (row.background_type === 'color') {
    return {type: 'color', colorKey: row.background_color_key}
  }
  return {
    type: 'image',
    url: profileMediaUrl(baseUrl, row.background_object_key, row.id, 'background')!,
    focalX: Number(row.background_focal_x),
    focalY: Number(row.background_focal_y),
  }
}

function normalizeAccount(row: ProfileRow, baseUrl?: string): CurrentAccount {
  return AccountSchema.parse({
    id: row.id,
    kind: row.account_kind,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: profileMediaUrl(baseUrl, row.avatar_object_key, row.id, 'avatar'),
    preferredLocale: row.preferred_locale,
    creatorModeEnabled: row.creator_mode_enabled,
    profileVersion: Number(row.profile_version),
    background: accountBackground(row, baseUrl),
  })
}

function normalizeHumanProfile(row: ProfileRow, baseUrl?: string): HumanProfile {
  const account = normalizeAccount(row, baseUrl)
  if (account.kind !== 'human' || row.account_kind !== 'human') {
    throw new Error('Expected a human profile')
  }
  return {...account, authSubject: row.auth_subject, accountKind: 'human'}
}

function normalizeCurrentAccount(
  value: unknown,
  bio?: string | null,
  baseUrl?: string,
): CurrentAccount | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const id = String(row.id)
  const backgroundType = row.background_type
  return AccountSchema.parse({
    id,
    kind: row.account_kind,
    username: row.username,
    displayName: row.display_name,
    ...(bio === undefined ? {} : {bio}),
    avatarUrl: profileMediaUrl(
      baseUrl,
      typeof row.avatar_object_key === 'string' ? row.avatar_object_key : null,
      id,
      'avatar',
    ),
    preferredLocale: row.preferred_locale,
    creatorModeEnabled: row.creator_mode_enabled,
    profileVersion: Number(row.profile_version),
    background: backgroundType === 'image'
      ? {
          type: 'image',
          url: profileMediaUrl(
            baseUrl,
            typeof row.background_object_key === 'string' ? row.background_object_key : null,
            id,
            'background',
          ),
          focalX: Number(row.background_focal_x),
          focalY: Number(row.background_focal_y),
        }
      : {type: 'color', colorKey: row.background_color_key},
  })
}

function normalizeReservation(row: ProfileAssetReservationRow): ProfileAssetReservation {
  return {
    id: row.asset_id,
    ownerProfileId: row.owner_profile_id,
    role: row.role,
    stagingObjectKey: row.staging_object_key,
    finalObjectKey: row.final_object_key,
    uploadContentType: row.upload_content_type,
    finalContentType: row.final_content_type,
    sizeBytes: Number(row.size_bytes),
    width: Number(row.width),
    height: Number(row.height),
    expiresAt: iso(row.expires_at),
    verifiedAt: row.verified_at === null ? null : iso(row.verified_at),
  }
}

function profileAssetExtension(contentType: ProfileImageContentType): 'jpg' | 'png' | 'webp' {
  return {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }[contentType] as 'jpg' | 'png' | 'webp'
}

function mapProfileWriteError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('PROFILE_VERSION_CONFLICT')) {
    throw new ProfileRepositoryError('PROFILE_VERSION_CONFLICT')
  }
  if (message.includes('PROFILE_ASSET_UNAVAILABLE')) {
    throw new ProfileRepositoryError('PROFILE_ASSET_UNAVAILABLE')
  }
  throw error
}

function isUsernameConflict(error: unknown): boolean {
  const postgresError = error as {code?: string; constraint?: string}
  return postgresError.code === '23505' && postgresError.constraint === 'profiles_username_unique'
}

async function withProvisioner<T>(
  pool: QueryPool,
  callback: (client: Awaited<ReturnType<QueryPool['connect']>>) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE aifans_provisioner')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export function createProfileRepository({
  adminPool,
  withActor: runWithActor,
  publicMediaBaseUrl,
}: {
  adminPool: QueryPool
  withActor: WithActor
  publicMediaBaseUrl?: string
}): ProfileRepository {
  const normalizedMediaBaseUrl = normalizePublicMediaBaseUrl(publicMediaBaseUrl)
  return {
    async ensureHumanProfile(input: EnsureHumanProfileInput): Promise<HumanProfile> {
      if (!input.authSubject.trim()) {
        throw new Error('Auth subject must not be blank')
      }

      const existingProfile = await withProvisioner(adminPool, async (existing) => {
        const result = await existing.query<ProfileRow>(
          `SELECT id, auth_subject, account_kind, username, display_name, preferred_locale, creator_mode_enabled,
                  avatar_object_key, background_type, background_color_key, background_object_key,
                  background_focal_x, background_focal_y, profile_version
           FROM public.profiles WHERE auth_subject = $1`,
          [input.authSubject],
        )
        return result.rows[0] ? normalizeHumanProfile(result.rows[0], normalizedMediaBaseUrl) : null
      })
      if (existingProfile) return existingProfile

      const displayName = displayNameFor(input)
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const profile = await withProvisioner(adminPool, async (client) => {
            const inserted = await client.query<ProfileRow>(
            `INSERT INTO public.profiles (
              id, auth_subject, account_kind, username, display_name
            ) VALUES ($1, $2, 'human', $3, $4)
            ON CONFLICT (auth_subject) DO NOTHING
            RETURNING id, auth_subject, account_kind, username, display_name, preferred_locale, creator_mode_enabled,
                      avatar_object_key, background_type, background_color_key, background_object_key,
                      background_focal_x, background_focal_y, profile_version`,
            [randomUUID(), input.authSubject, candidateUsername(), displayName],
          )
            if (inserted.rows[0]) return normalizeHumanProfile(inserted.rows[0], normalizedMediaBaseUrl)

            const result = await client.query<ProfileRow>(
            `SELECT id, auth_subject, account_kind, username, display_name, preferred_locale, creator_mode_enabled,
                    avatar_object_key, background_type, background_color_key, background_object_key,
                    background_focal_x, background_focal_y, profile_version
             FROM public.profiles WHERE auth_subject = $1`,
            [input.authSubject],
          )
            return result.rows[0] ? normalizeHumanProfile(result.rows[0], normalizedMediaBaseUrl) : null
          })
          if (profile) return profile
        } catch (error) {
          if (!isUsernameConflict(error) || attempt === 4) throw error
        }
      }

      throw new Error('Unable to provision a unique username')
    },

    async getCurrentAccount(actor: Actor | null): Promise<CurrentAccount | null> {
      if (actor === null) return null
      return runWithActor(actor, async (client) => {
        const result = await client.query<CurrentAccountRow>(
          `SELECT public.current_account() AS current_account,
                  (SELECT bio FROM public.profiles WHERE id = public.current_profile_id()) AS bio`,
        )
        const row = result.rows[0]
        return normalizeCurrentAccount(row?.current_account ?? null, row?.bio, normalizedMediaBaseUrl)
      })
    },

    async reserveProfileAsset(actor: Actor, input: ProfileAssetIntentRequest): Promise<ProfileAssetReservation> {
      const value = ProfileAssetIntentRequestSchema.parse(input)
      return runWithActor(actor, async (client) => {
        const profile = await client.query<{id: string}>(
          'SELECT public.current_profile_id() AS id',
        )
        const profileId = profile.rows[0]?.id
        if (!profileId) throw new Error('PROFILE_NOT_FOUND')
        const assetId = randomUUID()
        const stagingObjectKey = `staging/profiles/${profileId}/${value.role}/${assetId}.${profileAssetExtension(value.contentType)}`
        const finalObjectKey = `public/profiles/${profileId}/${value.role}/${assetId}.webp`
        const result = await client.query<ProfileAssetReservationRow>(
          'SELECT * FROM public.profile_reserve_asset($1,$2,$3,$4,$5,$6,$7,$8)',
          [assetId, value.role, stagingObjectKey, finalObjectKey, value.contentType, value.sizeBytes, value.width, value.height],
        )
        const row = result.rows[0]
        if (!row) throw new Error('PROFILE_ASSET_RESERVATION_FAILED')
        return normalizeReservation(row)
      })
    },

    async getProfileAssetReservation(actor: Actor, assetId: string): Promise<ProfileAssetReservation | null> {
      return runWithActor(actor, async (client) => {
        const result = await client.query<ProfileAssetReservationRow>(
          'SELECT * FROM public.profile_get_asset_reservation($1)',
          [assetId],
        )
        return result.rows[0] ? normalizeReservation(result.rows[0]) : null
      })
    },

    async confirmProfileAsset(actor: Actor, assetId: string, finalObjectKey: string): Promise<ProfileAssetReservation | null> {
      return runWithActor(actor, async (client) => {
        const result = await client.query<ProfileAssetReservationRow>(
          'SELECT * FROM public.profile_confirm_asset($1,$2)',
          [assetId, finalObjectKey],
        )
        return result.rows[0] ? normalizeReservation(result.rows[0]) : null
      })
    },

    async updateCurrentAccount(actor: Actor | null, input: UpdateCurrentAccount): Promise<CurrentAccount | null> {
      if (actor === null) return null
      return runWithActor(actor, async (client) => {
        const background = input.background
        try {
          const updated = await client.query<CurrentAccountRow>(
            `SELECT public.profile_update_current_account(
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
             ) AS current_account`,
            [
              input.profileVersion,
              input.username ?? null,
              input.username !== undefined,
              input.displayName ?? null,
              input.displayName !== undefined,
              input.bio ?? null,
              input.bio !== undefined,
              input.preferredLocale ?? null,
              input.preferredLocale !== undefined,
              input.avatarAssetId ?? null,
              input.avatarAssetId !== undefined,
              background?.type ?? null,
              background?.type === 'color' ? background.colorKey : null,
              background?.type === 'image' ? background.backgroundAssetId ?? null : null,
              background?.type === 'image' ? background.focalX : null,
              background?.type === 'image' ? background.focalY : null,
              background !== undefined,
            ],
          )
          if (updated.rows[0]?.current_account == null) return null
          const result = await client.query<CurrentAccountRow>(
            `SELECT public.current_account() AS current_account,
                    (SELECT bio FROM public.profiles WHERE id = public.current_profile_id()) AS bio`,
          )
          const row = result.rows[0]
          return normalizeCurrentAccount(
            row?.current_account ?? null,
            row?.bio,
            normalizedMediaBaseUrl,
          )
        } catch (error) {
          return mapProfileWriteError(error)
        }
      })
    },
  }
}

let provisioningPool: Pool | undefined

function getProvisioningPool(): Pool {
  provisioningPool ??= new Pool({connectionString: requireProvisioningUrl()})
  return provisioningPool
}

function getRepository(): ProfileRepository {
  return createProfileRepository({adminPool: getProvisioningPool(), withActor})
}

export async function ensureHumanProfile(input: EnsureHumanProfileInput): Promise<HumanProfile> {
  return getRepository().ensureHumanProfile(input)
}

export async function getCurrentAccount(actor: Actor | null): Promise<CurrentAccount | null> {
  return getRepository().getCurrentAccount(actor)
}

export async function updateCurrentAccount(actor: Actor | null, input: UpdateCurrentAccount): Promise<CurrentAccount | null> {
  return getRepository().updateCurrentAccount(actor, input)
}
