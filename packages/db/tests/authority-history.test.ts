import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createAuthorityRepository,
} from '../src/index.js'
import {createHistoryRepository} from '../src/history.js'
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
  return expectRejected(client, sql, /append-only/)
}

async function expectRejected(client: PoolClient, sql: string, error: RegExp): Promise<void> {
  await client.query('SAVEPOINT append_only')
  await expect(client.query(sql)).rejects.toThrow(error)
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
      const eventId = randomUUID()
      const ids = await history.record(client, {
        audit: { actorProfileId: actor.id, action: 'operator_granted', entityType: 'profile', entityId: actor.id, sourceApp: 'admin', changeSummary: {role: 'operator'} },
        business: { eventName: 'account_registered', actorProfileId: actor.id, subjectEntityType: 'profile', subjectEntityId: actor.id, environment: 'test', properties: { event_id: eventId } },
        transition: { entityType: 'profile', entityId: actor.id, nextState: 'active', actorProfileId: actor.id },
        outbox: { destination: 'posthog', payloadVersion: 1, payload: { event_id: eventId, event_name: 'account_registered', event_version: 1 } },
      })
      for (const [table, id] of Object.entries(ids).filter(([table]) => table !== 'analytics_outbox')) {
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

  it('allows a pending outbox row to retry, deliver, or fail once but protects its event payload', async () => {
    await transaction(async (client) => {
      const actor = await insertHuman(client)
      const history = createHistoryRepository()
      const trackingEventId = randomUUID()
      const eventId = await history.recordBusinessEvent(client, {
        eventName: 'account_registered', actorProfileId: actor.id, subjectEntityType: 'profile', subjectEntityId: actor.id, environment: 'test', properties: {event_id: trackingEventId},
      })
      const retryId = await history.recordOutbox(client, eventId, {destination: 'posthog', payloadVersion: 1, payload: {event_id: trackingEventId, event_name: 'account_registered', event_version: 1}})
      await expect(client.query(`UPDATE public.analytics_outbox SET attempt_count = 1, next_attempt_at = clock_timestamp() + interval '1 minute', last_error_code = 'timeout' WHERE id = $1`, [retryId])).resolves.toMatchObject({rowCount: 1})
      await expect(client.query(`UPDATE public.analytics_outbox SET state = 'delivered', delivered_at = clock_timestamp(), last_error_code = NULL WHERE id = $1`, [retryId])).resolves.toMatchObject({rowCount: 1})
      await expectRejected(client, `UPDATE public.analytics_outbox SET attempt_count = 2 WHERE id = '${retryId}'`, /terminal/)
      await expectRejected(client, `UPDATE public.analytics_outbox SET payload = '{}'::jsonb WHERE id = '${retryId}'`, /immutable/)
      await expectAppendOnly(client, `DELETE FROM public.analytics_outbox WHERE id = '${retryId}'`)

      const failedEventId = await history.recordBusinessEvent(client, {
        eventName: 'account_registered', actorProfileId: actor.id, subjectEntityType: 'profile', subjectEntityId: actor.id, environment: 'test', properties: {event_id: randomUUID()},
      })
      const failedId = await history.recordOutbox(client, failedEventId, {destination: 'posthog', payloadVersion: 1, payload: {event_id: randomUUID(), event_name: 'account_registered', event_version: 1}})
      await expect(client.query(`UPDATE public.analytics_outbox SET state = 'failed', last_error_code = 'invalid_payload' WHERE id = $1`, [failedId])).resolves.toMatchObject({rowCount: 1})
      await expectRejected(client, `UPDATE public.analytics_outbox SET state = 'pending' WHERE id = '${failedId}'`, /terminal/)
    })
  })

  it('rejects unknown or sensitive history contract fields before they persist', async () => {
    await transaction(async (client) => {
      const actor = await insertHuman(client)
      const history = createHistoryRepository()
      await expect(history.recordAudit(client, {
        actorProfileId: actor.id, action: 'operator_granted', entityType: 'profile', entityId: actor.id, sourceApp: 'admin', changeSummary: {email: 'private@example.com'},
      })).rejects.toThrow(/sensitive|unknown/i)
      await expect(history.recordBusinessEvent(client, {
        eventName: 'account_registered', actorProfileId: actor.id, subjectEntityType: 'profile', subjectEntityId: actor.id, environment: 'test', properties: {email: 'private@example.com'} as never,
      })).rejects.toThrow(/sensitive|unknown/i)
      await expect(history.recordOutbox(client, randomUUID(), {destination: 'other', payloadVersion: 99, payload: {event_id: randomUUID(), event_name: 'account_registered', event_version: 1}})).rejects.toThrow(/destination|version/i)
      await expect(client.query('SELECT * FROM public.audit_events WHERE actor_profile_id = $1', [actor.id])).resolves.toMatchObject({rowCount: 0})
    })
  })

  it('rejects unknown and sensitive contract keys for every persisted history payload', async () => {
    await transaction(async (client) => {
      const actor = await insertHuman(client)
      const history = createHistoryRepository()
      const sensitiveKeys = ['access_token', 'email_address', 'database_url', 'signed_url', 'private_message', 'post_text', 'comment_text', 'search_query', 'prompt', 'cookie', 'secret']
      await expect(history.recordAudit(client, {
        actorProfileId: actor.id, action: 'operator_granted', entityType: 'profile', entityId: actor.id, sourceApp: 'admin', changeSummary: {note: 'innocuous'} as never,
      })).rejects.toThrow(/unrecognized|sensitive/i)
      for (const key of sensitiveKeys) {
        await expect(history.recordBusinessEvent(client, {
          eventName: 'account_registered', actorProfileId: actor.id, subjectEntityType: 'profile', subjectEntityId: actor.id, environment: 'test', properties: {event_id: randomUUID(), [key]: 'private'} as never,
        })).rejects.toThrow(/unrecognized|sensitive/i)
        await expect(history.recordOutbox(client, randomUUID(), {
          destination: 'posthog', payloadVersion: 1, payload: {event_id: randomUUID(), event_name: 'account_registered', event_version: 1, [key]: 'private'} as never,
        })).rejects.toThrow(/unrecognized|sensitive/i)
      }
      await expect(client.query('SELECT * FROM public.audit_events WHERE actor_profile_id = $1', [actor.id])).resolves.toMatchObject({rowCount: 0})
      await expect(client.query('SELECT * FROM public.business_events WHERE actor_profile_id = $1', [actor.id])).resolves.toMatchObject({rowCount: 0})
      await expect(client.query('SELECT * FROM public.analytics_outbox')).resolves.toMatchObject({rowCount: 0})
    })
  })
})
