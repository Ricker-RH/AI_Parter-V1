import {z} from 'zod'
import {Pool} from '@neondatabase/serverless'
import {createAnalyticsDeliveryIdentity} from '@aifans/contracts'
import {parseHistoryOutboxPayload, type HistoryOutboxPayload} from './history.js'
import type {QueryClient, QueryPool} from './session.js'

const uuid = z.string().uuid()
const claimOptions = z.strictObject({
  leaseToken: uuid,
  limit: z.number().int().min(1).max(100),
  leaseSeconds: z.number().int().min(1).max(3600),
})
const errorCode = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)

export type AnalyticsOutboxEvent = {
  id: string
  eventId: string
  attemptCount: number
  occurredAt: string
  actorProfileId: string | null
  distinctId: string
  payload: HistoryOutboxPayload
}

export type AnalyticsOutboxRepository = ReturnType<typeof createAnalyticsOutboxRepository>

export function createAnalyticsOutboxRepository(client: QueryClient) {
  return {
    async claim(input: z.infer<typeof claimOptions>): Promise<AnalyticsOutboxEvent[]> {
      input = claimOptions.parse(input)
      const result = await client.query<{
        id: string
        event_id: string | null
        attempt_count: number
        occurred_at: Date | string
        actor_profile_id: string | null
        actor_kind: 'human' | 'ip' | null
        payload: unknown
      }>('SELECT * FROM public.claim_analytics_outbox($1,$2,$3)', [input.leaseToken, input.limit, input.leaseSeconds])
      const events: AnalyticsOutboxEvent[] = []
      for (const row of result.rows) {
        const id = uuid.parse(row.id)
        try {
          const payload = parseHistoryOutboxPayload(row.payload)
          const eventId = uuid.parse(row.event_id)
          if (payload.event_id !== eventId) throw new Error('Mismatched analytics event ID')
          const occurredAt = z.union([z.date(), z.iso.datetime()]).transform((value) => typeof value === 'string' ? new Date(value).toISOString() : value.toISOString()).parse(row.occurred_at)
          const actorProfileId = row.actor_profile_id === null ? null : uuid.parse(row.actor_profile_id)
          const actorKind = z.enum(['human', 'ip']).nullable().parse(row.actor_kind)
          const {distinctId} = createAnalyticsDeliveryIdentity(actorKind, actorProfileId)
          events.push({id, eventId, attemptCount: z.number().int().min(0).parse(row.attempt_count), occurredAt, actorProfileId, distinctId, payload})
        } catch {
          await client.query('SELECT public.fail_analytics_outbox($1,$2,$3)', [id, input.leaseToken, 'invalid_payload'])
        }
      }
      return events
    },
    async acknowledge(id: string, leaseToken: string): Promise<boolean> {
      const result = await client.query<{value: boolean}>('SELECT public.acknowledge_analytics_outbox($1,$2) AS value', [uuid.parse(id), uuid.parse(leaseToken)])
      return result.rows[0]?.value === true
    },
    async retry(id: string, leaseToken: string, code: string, retrySeconds: number): Promise<boolean> {
      const result = await client.query<{value: boolean}>('SELECT public.retry_analytics_outbox($1,$2,$3,$4) AS value', [uuid.parse(id), uuid.parse(leaseToken), errorCode.parse(code), z.number().int().min(1).max(86400).parse(retrySeconds)])
      return result.rows[0]?.value === true
    },
    async fail(id: string, leaseToken: string, code: string): Promise<boolean> {
      const result = await client.query<{value: boolean}>('SELECT public.fail_analytics_outbox($1,$2,$3) AS value', [uuid.parse(id), uuid.parse(leaseToken), errorCode.parse(code)])
      return result.rows[0]?.value === true
    },
  }
}

export function createPooledAnalyticsOutboxRepository(pool: QueryPool): AnalyticsOutboxRepository {
  const run = async <T>(operation: (repository: AnalyticsOutboxRepository) => Promise<T>): Promise<T> => {
    const client = await pool.connect()
    try {
      return await operation(createAnalyticsOutboxRepository(client))
    } finally {
      client.release()
    }
  }
  return {
    claim: (input) => run((repository) => repository.claim(input)),
    acknowledge: (id, leaseToken) => run((repository) => repository.acknowledge(id, leaseToken)),
    retry: (id, leaseToken, code, retrySeconds) => run((repository) => repository.retry(id, leaseToken, code, retrySeconds)),
    fail: (id, leaseToken, code) => run((repository) => repository.fail(id, leaseToken, code)),
  }
}

const analyticsPools = new Map<string, Pool>()

export function createAnalyticsOutboxRepositoryFromUrl(connectionString: string): AnalyticsOutboxRepository {
  let parsed: URL
  try {
    parsed = new URL(connectionString)
  } catch {
    throw new Error('Analytics database URL must be a valid postgres URL')
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('Analytics database URL must be a valid postgres URL')
  }
  let pool = analyticsPools.get(connectionString)
  if (!pool) {
    pool = new Pool({connectionString})
    analyticsPools.set(connectionString, pool)
  }
  return createPooledAnalyticsOutboxRepository(pool)
}
