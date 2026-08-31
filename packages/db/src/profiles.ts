import {randomUUID} from 'node:crypto'
import {Pool} from '@neondatabase/serverless'
import {AccountSchema, type Account} from '@aifans/contracts'
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
}

type CurrentAccountRow = {
  current_account: unknown
}

export type ProfileRepository = {
  ensureHumanProfile(input: EnsureHumanProfileInput): Promise<HumanProfile>
  getCurrentAccount(actor: Actor | null): Promise<CurrentAccount | null>
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

function normalizeAccount(row: ProfileRow): CurrentAccount {
  return AccountSchema.parse({
    id: row.id,
    kind: row.account_kind,
    username: row.username,
    displayName: row.display_name,
    preferredLocale: row.preferred_locale,
    creatorModeEnabled: row.creator_mode_enabled,
  })
}

function normalizeHumanProfile(row: ProfileRow): HumanProfile {
  const account = normalizeAccount(row)
  if (account.kind !== 'human' || row.account_kind !== 'human') {
    throw new Error('Expected a human profile')
  }
  return {...account, authSubject: row.auth_subject, accountKind: 'human'}
}

function normalizeCurrentAccount(value: unknown): CurrentAccount | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  return AccountSchema.parse({
    id: row.id,
    kind: row.account_kind,
    username: row.username,
    displayName: row.display_name,
    preferredLocale: row.preferred_locale,
    creatorModeEnabled: row.creator_mode_enabled,
  })
}

function isUsernameConflict(error: unknown): boolean {
  const postgresError = error as {code?: string; constraint?: string}
  return postgresError.code === '23505' && postgresError.constraint === 'profiles_username_unique'
}

export function createProfileRepository({
  adminPool,
  withActor: runWithActor,
}: {
  adminPool: QueryPool
  withActor: WithActor
}): ProfileRepository {
  return {
    async ensureHumanProfile(input: EnsureHumanProfileInput): Promise<HumanProfile> {
      if (!input.authSubject.trim()) {
        throw new Error('Auth subject must not be blank')
      }

      const existing = await adminPool.connect()
      try {
        const result = await existing.query<ProfileRow>(
          `SELECT id, auth_subject, account_kind, username, display_name, preferred_locale, creator_mode_enabled
           FROM public.profiles WHERE auth_subject = $1`,
          [input.authSubject],
        )
        if (result.rows[0]) return normalizeHumanProfile(result.rows[0])
      } finally {
        existing.release()
      }

      const displayName = displayNameFor(input)
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const client = await adminPool.connect()
        try {
          const inserted = await client.query<ProfileRow>(
            `INSERT INTO public.profiles (
              id, auth_subject, account_kind, username, display_name
            ) VALUES ($1, $2, 'human', $3, $4)
            ON CONFLICT (auth_subject) DO NOTHING
            RETURNING id, auth_subject, account_kind, username, display_name, preferred_locale, creator_mode_enabled`,
            [randomUUID(), input.authSubject, candidateUsername(), displayName],
          )
          if (inserted.rows[0]) return normalizeHumanProfile(inserted.rows[0])

          const result = await client.query<ProfileRow>(
            `SELECT id, auth_subject, account_kind, username, display_name, preferred_locale, creator_mode_enabled
             FROM public.profiles WHERE auth_subject = $1`,
            [input.authSubject],
          )
          if (result.rows[0]) return normalizeHumanProfile(result.rows[0])
        } catch (error) {
          if (!isUsernameConflict(error) || attempt === 4) throw error
        } finally {
          client.release()
        }
      }

      throw new Error('Unable to provision a unique username')
    },

    async getCurrentAccount(actor: Actor | null): Promise<CurrentAccount | null> {
      if (actor === null) return null
      return runWithActor(actor, async (client) => {
        const result = await client.query<CurrentAccountRow>(
          'SELECT public.current_account() AS current_account',
        )
        return normalizeCurrentAccount(result.rows[0]?.current_account ?? null)
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
