import {randomUUID} from 'node:crypto'
import {Pool, type PoolClient} from 'pg'
import {afterAll, describe, expect, it} from 'vitest'
import {createAnalyticsOutboxRepository} from '../src/analytics-outbox.js'
import {createHistoryRepository} from '../src/history.js'

const connectionString = process.env.DATABASE_URL ?? ''
const describeIntegration = connectionString ? describe : describe.skip
const pool = new Pool({connectionString})

async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    return await callback(client)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    client.release()
  }
}

async function pendingEvent(client: PoolClient, eventId = randomUUID()) {
  const profileId = randomUUID()
  await client.query(
    `INSERT INTO public.profiles (id,auth_subject,account_kind,username,display_name)
     VALUES ($1,$2,'human',$3,'Analytics user')`,
    [profileId, `auth-${profileId}`, `analytics_${profileId.replaceAll('-', '').slice(0, 20)}`],
  )
  const history = createHistoryRepository()
  const businessEventId = await history.recordBusinessEvent(client, {
    eventName: 'account_registered', actorProfileId: profileId,
    subjectEntityType: 'profile', subjectEntityId: profileId,
    environment: 'test', properties: {event_id: eventId},
  })
  const outboxId = await history.recordOutbox(client, businessEventId, {
    destination: 'posthog', payloadVersion: 1,
    payload: {event_id: eventId, event_name: 'account_registered', event_version: 1},
  })
  return {businessEventId, eventId, outboxId, profileId}
}

describeIntegration('analytics outbox delivery', () => {
  afterAll(async () => pool.end())

  it('claims a bounded batch with stable event IDs and no duplicate concurrent claims', async () => {
    await transaction(async (client) => {
      const first = await pendingEvent(client)
      const second = await pendingEvent(client)
      await pendingEvent(client)
      const repository = createAnalyticsOutboxRepository(client)
      const claimA = await repository.claim({leaseToken: randomUUID(), limit: 2, leaseSeconds: 60})
      const claimB = await repository.claim({leaseToken: randomUUID(), limit: 2, leaseSeconds: 60})

      expect(claimA).toHaveLength(2)
      expect(claimB).toHaveLength(1)
      expect(new Set([...claimA, ...claimB].map((row) => row.id)).size).toBe(3)
      expect(new Set(claimA.map((row) => row.eventId))).toEqual(new Set([first.eventId, second.eventId]))
      expect(claimA[0]?.payload.event_id).toBe(claimA[0]?.eventId)
      expect(claimA[0]?.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  it('uses SKIP LOCKED across concurrent database workers', async () => {
    const seedClient = await pool.connect()
    const firstWorker = await pool.connect()
    const secondWorker = await pool.connect()
    const firstLease = randomUUID()
    const secondLease = randomUUID()
    try {
      const created = [await pendingEvent(seedClient), await pendingEvent(seedClient), await pendingEvent(seedClient)]
      await Promise.all([firstWorker.query('BEGIN'), secondWorker.query('BEGIN')])
      const [first, second] = await Promise.all([
        createAnalyticsOutboxRepository(firstWorker).claim({leaseToken: firstLease, limit: 2, leaseSeconds: 60}),
        createAnalyticsOutboxRepository(secondWorker).claim({leaseToken: secondLease, limit: 2, leaseSeconds: 60}),
      ])
      await Promise.all([firstWorker.query('COMMIT'), secondWorker.query('COMMIT')])
      expect(new Set([...first, ...second].map((row) => row.id))).toEqual(new Set(created.map((row) => row.outboxId)))
      expect(new Set([...first, ...second].map((row) => row.id)).size).toBe(3)
      for (const event of first) await createAnalyticsOutboxRepository(firstWorker).acknowledge(event.id, firstLease)
      for (const event of second) await createAnalyticsOutboxRepository(secondWorker).acknowledge(event.id, secondLease)
    } finally {
      await Promise.all([firstWorker.query('ROLLBACK').catch(() => undefined), secondWorker.query('ROLLBACK').catch(() => undefined)])
      seedClient.release()
      firstWorker.release()
      secondWorker.release()
    }
  })

  it('acknowledges only the active lease and makes delivery terminal', async () => {
    await transaction(async (client) => {
      const repository = createAnalyticsOutboxRepository(client)
      const created = await pendingEvent(client)
      const leaseToken = randomUUID()
      await repository.claim({leaseToken, limit: 1, leaseSeconds: 60})

      await expect(repository.acknowledge(created.outboxId, randomUUID())).resolves.toBe(false)
      await expect(repository.acknowledge(created.outboxId, leaseToken)).resolves.toBe(true)
      await expect(repository.acknowledge(created.outboxId, leaseToken)).resolves.toBe(false)
      await expect(client.query(
        'SELECT state,attempt_count,delivered_at IS NOT NULL AS delivered FROM public.analytics_outbox WHERE id=$1',
        [created.outboxId],
      )).resolves.toMatchObject({rows: [{state: 'delivered', attempt_count: 1, delivered: true}]})
    })
  })

  it('schedules transient retries with attempts and allows stale lease recovery', async () => {
    await transaction(async (client) => {
      const repository = createAnalyticsOutboxRepository(client)
      const created = await pendingEvent(client)
      const firstLease = randomUUID()
      await repository.claim({leaseToken: firstLease, limit: 1, leaseSeconds: 1})
      await expect(repository.retry(created.outboxId, firstLease, 'provider_timeout', 30)).resolves.toBe(true)
      expect(await repository.claim({leaseToken: randomUUID(), limit: 1, leaseSeconds: 60})).toEqual([])

      const stale = await pendingEvent(client)
      const staleLease = randomUUID()
      await repository.claim({leaseToken: staleLease, limit: 1, leaseSeconds: 1})
      await client.query("UPDATE public.analytics_outbox SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [stale.outboxId])
      await expect(repository.acknowledge(stale.outboxId, staleLease)).resolves.toBe(false)
      const recoveredLease = randomUUID()
      const recovered = await repository.claim({leaseToken: recoveredLease, limit: 1, leaseSeconds: 60})
      expect(recovered).toHaveLength(1)
      await expect(repository.acknowledge(stale.outboxId, staleLease)).resolves.toBe(false)
      await expect(repository.acknowledge(stale.outboxId, recoveredLease)).resolves.toBe(true)
    })
  })

  it('records permanent failures and never reclaims them', async () => {
    await transaction(async (client) => {
      const repository = createAnalyticsOutboxRepository(client)
      const created = await pendingEvent(client)
      const leaseToken = randomUUID()
      await repository.claim({leaseToken, limit: 1, leaseSeconds: 60})
      await expect(repository.fail(created.outboxId, leaseToken, 'invalid_payload')).resolves.toBe(true)
      await expect(repository.claim({leaseToken: randomUUID(), limit: 10, leaseSeconds: 60})).resolves.toEqual([])
      await expect(client.query('SELECT state,attempt_count,last_error_code FROM public.analytics_outbox WHERE id=$1', [created.outboxId]))
        .resolves.toMatchObject({rows: [{state: 'failed', attempt_count: 1, last_error_code: 'invalid_payload'}]})
    })
  })

  it('validates claimed payloads against the closed history contract before sending', async () => {
    await transaction(async (client) => {
      const profileId = randomUUID()
      await client.query("INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'Invalid analytics')", [profileId, `auth-${profileId}`, `invalid_${profileId.replaceAll('-', '').slice(0, 20)}`])
      const businessEventId = await createHistoryRepository().recordBusinessEvent(client, {
        eventName: 'account_registered', actorProfileId: profileId, subjectEntityType: 'profile', subjectEntityId: profileId,
        environment: 'test', properties: {event_id: randomUUID()},
      })
      const outboxId = randomUUID()
      await client.query("INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload) VALUES($1,$2,'posthog',1,jsonb_build_object('event_id','not-a-uuid','event_name','unknown','event_version',1))", [outboxId, businessEventId])
      const repository = createAnalyticsOutboxRepository(client)
      await expect(repository.claim({leaseToken: randomUUID(), limit: 1, leaseSeconds: 60})).resolves.toEqual([])
      await expect(client.query('SELECT state,last_error_code FROM public.analytics_outbox WHERE id=$1', [outboxId]))
        .resolves.toMatchObject({rows: [{state: 'failed', last_error_code: 'invalid_payload'}]})
    })
  })

  it('denies worker functions to product roles', async () => {
    for (const role of ['aifans_anon', 'aifans_authenticated', 'aifans_platform']) {
      await transaction(async (client) => {
        await client.query(`SET LOCAL ROLE ${role}`)
        await expect(client.query('SELECT * FROM public.claim_analytics_outbox($1,1,60)', [randomUUID()]))
          .rejects.toThrow(/permission denied/)
      })
    }
  })

  it('allows only the dedicated analytics delivery role to execute worker functions', async () => {
    await transaction(async (client) => {
      const created = await pendingEvent(client)
      const leaseToken = randomUUID()
      await client.query('SET LOCAL ROLE aifans_analytics_delivery')
      const claimed = await client.query('SELECT id FROM public.claim_analytics_outbox($1,1,60)', [leaseToken])
      expect(claimed.rows).toEqual([{id: created.outboxId}])
      await expect(client.query('SELECT public.acknowledge_analytics_outbox($1,$2) AS value', [created.outboxId, leaseToken]))
        .resolves.toMatchObject({rows: [{value: true}]})
    })
  })
})
