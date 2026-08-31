import {Pool} from '@neondatabase/serverless'
import {withActor, type Actor, type QueryPool, type WithActor} from './session.js'
import {createHistoryRepository} from './history.js'

export type GrantOperatorInput = {authSubject: string; grantedByAuthSubject: string}
export type AuthorityRepository = {grantOperator(input: GrantOperatorInput): Promise<void>; isCurrentActorOperator(actor: Actor): Promise<boolean>}

function nonBlank(value: string, field: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field} must not be blank`)
  return trimmed
}

async function humanProfileId(client: Awaited<ReturnType<QueryPool['connect']>>, subject: string): Promise<string> {
  const result = await client.query<{id: string}>(`SELECT id FROM public.profiles WHERE auth_subject = $1 AND account_kind = 'human'`, [subject])
  if (!result.rows[0]) throw new Error('Operator grants require an existing human profile')
  return result.rows[0].id
}

export function createAuthorityRepository({adminPool, withActor: runWithActor = withActor}: {adminPool: QueryPool; withActor?: WithActor}): AuthorityRepository {
  return {
    async isCurrentActorOperator(actor: Actor): Promise<boolean> {
      return runWithActor(actor, async (client) => {
        const result = await client.query<{current_operator: boolean}>('SELECT public.current_operator() AS current_operator')
        return result.rows[0]?.current_operator === true
      })
    },
    async grantOperator(input: GrantOperatorInput): Promise<void> {
      const subject = nonBlank(input.authSubject, 'Auth subject')
      const grantedBySubject = nonBlank(input.grantedByAuthSubject, 'Granting auth subject')
      const client = await adminPool.connect()
      const transaction = await client.query<{txid: string | null}>('SELECT txid_current_if_assigned() AS txid')
      const ownsTransaction = transaction.rows[0]?.txid === null
      try {
        await client.query(ownsTransaction ? 'BEGIN' : 'SAVEPOINT operator_grant')
        const profileId = await humanProfileId(client, subject)
        const grantedByProfileId = await humanProfileId(client, grantedBySubject)
        const membership = await client.query<{profile_id: string}>(`INSERT INTO public.profile_roles (profile_id, role, granted_by_profile_id) VALUES ($1, 'operator', $2) ON CONFLICT (profile_id, role) DO UPDATE SET revoked_at = NULL WHERE public.profile_roles.revoked_at IS NOT NULL RETURNING profile_id`, [profileId, grantedByProfileId])
        if (membership.rows[0]) {
          await createHistoryRepository().recordAudit(client, {actorProfileId: grantedByProfileId, actorType: 'operator', action: 'operator_granted', entityType: 'profile', entityId: profileId, sourceApp: 'admin'})
        }
        await client.query(ownsTransaction ? 'COMMIT' : 'RELEASE SAVEPOINT operator_grant')
      } catch (error) {
        await client.query(ownsTransaction ? 'ROLLBACK' : 'ROLLBACK TO SAVEPOINT operator_grant').catch(() => undefined)
        if (!ownsTransaction) await client.query('RELEASE SAVEPOINT operator_grant').catch(() => undefined)
        throw error
      } finally { client.release() }
    },
  }
}

let adminPool: Pool | undefined
function getAdminPool(): Pool {
  adminPool ??= new Pool({connectionString: process.env.DATABASE_ADMIN_URL})
  return adminPool
}

export async function grantOperator(input: GrantOperatorInput): Promise<void> {
  return createAuthorityRepository({adminPool: getAdminPool()}).grantOperator(input)
}

export async function isCurrentActorOperator(actor: Actor): Promise<boolean> {
  return createAuthorityRepository({adminPool: getAdminPool()}).isCurrentActorOperator(actor)
}
