import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createAuthorityRepository,
  createHistoryRepository,
} from '../src/index.js'
import {createActorSession} from '../src/session.js'

const connectionString = process.env.DATABASE_URL ?? ''
const describeIntegration = connectionString ? describe : describe.skip
const pool = new Pool({ connectionString })

type Fixture = { id: string; subject: string }

async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('ROLLBACK')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function insertHuman(client: PoolClient): Promise<Fixture> {
  const id = randomUUID()
  const subject = `auth-${randomUUID()}`
  await client.query(
    `INSERT INTO public.profiles (id, auth_subject, account_kind, username, display_name)
     VALUES ($1, $2, 'human', $3, 'Operator fixture')`,
    [id, subject, `human_${id.replaceAll('-', '').slice(0, 20)}`],
  )
  return { id, subject }
}

async function expectPermissionDenied(client: PoolClient, sql: string): Promise<void> {
  await client.query('SAVEPOINT permission_denied')
  await expect(client.query(sql)).rejects.toThrow(/permission denied/)
  await client.query('ROLLBACK TO SAVEPOINT permission_denied')
  await client.query('RELEASE SAVEPOINT permission_denied')
}

async function expectAppendOnly(client: PoolClient, sql: string): Promise<void> {
  await client.query('SAVEPOINT append_only')
  await expect(client.query(sql)).rejects.toThrow(/append-only/)
  await client.query('ROLLBACK TO SAVEPOINT append_only')
  await client.query('RELEASE SAVEPOINT append_only')
}

async function restricted(client: PoolClient, role: 'aifans_anon' | 'aifans_authenticated', claims: unknown) {
  await client.query(`SET LOCAL ROLE ${role}`)
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)])
}

describeIntegration('operator authority and append-only history', () => {
  afterAll(async () => pool.end())

  it('authorizes only an explicitly granted current human operator', async () => {
    await transaction(async (client) => {
      const transactionPool = {connect: async () => ({query: client.query.bind(client), release: () => undefined})}
      const ordinary = await insertHuman(client)
      const operator = await insertHuman(client)
      const authority = createAuthorityRepository({ adminPool: transactionPool, withActor: createActorSession(transactionPool).withActor })
      expect(await authority.isCurrentActorOperator({ subject: ordinary.subject })).toBe(false)
      await authority.grantOperator({
        authSubject: operator.subject,
        grantedByAuthSubject: operator.subject,
      })
      await authority.grantOperator({
        authSubject: operator.subject,
        grantedByAuthSubject: operator.subject,
      })
      expect(await authority.isCurrentActorOperator({ subject: operator.subject })).toBe(true)

      await client.query('SET LOCAL ROLE NONE')

      const memberships = await client.query(
        "SELECT * FROM public.profile_roles WHERE profile_id = $1 AND role = 'operator' AND revoked_at IS NULL",
        [operator.id],
      )
      expect(memberships.rowCount).toBe(1)
      await expect(authority.grantOperator({ authSubject: 'missing', grantedByAuthSubject: operator.subject })).rejects.toThrow(/human profile/)
    })
  })

  it('returns false for malformed or blank current claims', async () => {
    await transaction(async (client) => {
      await restricted(client, 'aifans_authenticated', { sub: '   ' })
      await expect(client.query('SELECT public.current_operator() AS value')).resolves.toMatchObject({ rows: [{ value: false }] })
    })
    await transaction(async (client) => {
      await client.query('SET LOCAL ROLE aifans_authenticated')
      await client.query("SELECT set_config('request.jwt.claims', '{not json', true)")
      await expect(client.query('SELECT public.current_operator() AS value')).resolves.toMatchObject({ rows: [{ value: false }] })
    })
  })

  it('denies every restricted role all direct access to authority and history tables', async () => {
    const tables = ['profile_roles', 'audit_events', 'business_events', 'workflow_transitions', 'analytics_outbox']
    for (const role of ['aifans_anon', 'aifans_authenticated'] as const) {
      await transaction(async (client) => {
        await restricted(client, role, {})
        for (const table of tables) {
          await expectPermissionDenied(client, `SELECT * FROM public.${table}`)
          await expectPermissionDenied(client, `INSERT INTO public.${table} DEFAULT VALUES`)
          await expectPermissionDenied(client, `UPDATE public.${table} SET ${table === 'profile_roles' ? 'profile_id = profile_id' : 'id = id'}`)
          await expectPermissionDenied(client, `DELETE FROM public.${table}`)
        }
      })
    }
  })

  it('keeps history rows append-only and rolls back atomic writes', async () => {
    await transaction(async (client) => {
      const actor = await insertHuman(client)
      const history = createHistoryRepository()
      const ids = await history.record(client, {
        audit: { actorProfileId: actor.id, action: 'operator_granted', entityType: 'profile', entityId: actor.id, sourceApp: 'admin' },
        business: { eventName: 'account_registered', actorProfileId: actor.id, subjectEntityType: 'profile', subjectEntityId: actor.id, environment: 'test', properties: { event_id: 'fixture' } },
        transition: { entityType: 'profile', entityId: actor.id, nextState: 'active', actorProfileId: actor.id },
        outbox: { destination: 'posthog', payloadVersion: 1, payload: { event_id: 'fixture' } },
      })
      for (const [table, id] of Object.entries(ids)) {
        await expectAppendOnly(client, `UPDATE public.${table} SET id = id WHERE id = '${id}'`)
        await expectAppendOnly(client, `DELETE FROM public.${table} WHERE id = '${id}'`)
      }

      await expect(history.withAtomic(client, async (tx) => {
        await tx.query("INSERT INTO public.platform_settings (setting_key) VALUES ('global') ON CONFLICT DO NOTHING")
        await history.recordTransition(tx, { entityType: 'profile', entityId: actor.id, nextState: 'failed' })
        throw new Error('force rollback')
      })).rejects.toThrow('force rollback')
      await expect(client.query("SELECT * FROM public.workflow_transitions WHERE next_state = 'failed'")).resolves.toMatchObject({ rowCount: 0 })
    })
  })
})
