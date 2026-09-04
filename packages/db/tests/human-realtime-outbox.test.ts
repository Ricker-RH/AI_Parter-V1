import {randomUUID} from 'node:crypto'
import {Pool, type PoolClient} from 'pg'
import {afterAll, describe, expect, it} from 'vitest'

const connectionString = process.env.HUMAN_REALTIME_TEST_DATABASE_URL ?? ''
if (connectionString) {
  const url = new URL(connectionString)
  if (!['localhost','127.0.0.1'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/aifans_human_dm_test_v3') throw new Error('Outbox tests require the explicit local scratch database')
}
const pool = new Pool({connectionString})
const integration = connectionString ? describe : describe.skip
async function transaction(run: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect()
  try {await client.query('BEGIN'); await run(client)}
  finally {await client.query('ROLLBACK'); client.release()}
}
async function seed(client: PoolClient) {
  const people = [randomUUID(), randomUUID()].sort()
  for (const id of people) await client.query("INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1::uuid,$1::text,'human',$2,'Realtime')", [id, `rt_${id.replaceAll('-', '').slice(0,20)}`])
  const conversationId = randomUUID(), messageId = randomUUID(), requestId = randomUUID()
  await client.query('INSERT INTO public.human_dm_conversations(id,low_profile_id,high_profile_id,last_sequence) VALUES($1,$2,$3,1)', [conversationId,...people])
  for (const id of people) await client.query('INSERT INTO public.human_dm_members(conversation_id,profile_id) VALUES($1,$2)', [conversationId,id])
  await client.query(`INSERT INTO public.human_dm_messages(id,conversation_id,sender_profile_id,sequence,content,client_request_id) VALUES($1,$2,$3,1,'{"kind":"text","text":"persisted"}',$4)`, [messageId,conversationId,people[0],requestId])
  await client.query('INSERT INTO public.human_dm_outbox(message_id,conversation_id,recipient_profile_id) VALUES($1,$2,$3)', [messageId,conversationId,people[1]])
  return {people,conversationId,messageId}
}
integration('durable HUMAN realtime outbox', () => {
  afterAll(() => pool.end())
  it('validates repository events from persisted database projection', () => transaction(async client => {
    const module = await import('../src/human-realtime-outbox.js')
    const fixture = await seed(client), leaseToken = randomUUID()
    const repo = module.createHumanRealtimeOutboxRepository(client)
    const events = await repo.claim({leaseToken,limit:100,leaseSeconds:60})
    const event = events.find(value=>value.event.type==='message' && value.event.message.id===fixture.messageId)!
    expect(event.recipientProfileIds).toEqual(fixture.people)
    expect(event.eventId).toBe(event.event.eventId)
    expect(await repo.fail(event.id,leaseToken,'invalid_payload')).toBe(true)
    expect(await repo.acknowledge(event.id,leaseToken)).toBe(false)
  }))
  it('claims persisted messages for both parties, gates lease ownership and retries', () => transaction(async client => {
    const fixture = await seed(client), lease = randomUUID()
    const result = await client.query('SELECT * FROM public.claim_human_realtime_outbox($1,100,60)', [lease])
    const row = result.rows.find(row => row.event.message?.id === fixture.messageId)
    expect(row.recipient_profile_ids).toEqual(fixture.people)
    expect(row.event).toMatchObject({eventId:row.id,type:'message',message:{content:{kind:'text',text:'persisted'}}})
    expect((await client.query('SELECT public.acknowledge_human_realtime_outbox($1,$2) AS ok',[row.id,randomUUID()])).rows[0].ok).toBe(false)
    expect((await client.query("SELECT public.retry_human_realtime_outbox($1,$2,'provider_timeout',30) AS ok",[row.id,lease])).rows[0].ok).toBe(true)
    expect((await client.query('SELECT * FROM public.claim_human_realtime_outbox($1,100,60)',[randomUUID()])).rows.some(value=>value.id===row.id)).toBe(false)
    await client.query("UPDATE public.human_dm_outbox SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",[row.id])
    const recovered = (await client.query('SELECT * FROM public.claim_human_realtime_outbox($1,100,60)',[lease])).rows.find(value=>value.id===row.id)
    expect(recovered.event).toEqual(row.event)
    expect(recovered.attempt_count).toBe(2)
    expect((await client.query('SELECT public.acknowledge_human_realtime_outbox($1,$2) AS ok',[row.id,lease])).rows[0].ok).toBe(true)
  }))
  it('atomically emits only advancing read cursors and scoped block revocations', () => transaction(async client => {
    const fixture = await seed(client)
    await client.query('UPDATE public.human_dm_members SET read_sequence=1 WHERE conversation_id=$1 AND profile_id=$2',[fixture.conversationId,fixture.people[1]])
    await client.query('UPDATE public.human_dm_members SET read_sequence=1 WHERE conversation_id=$1 AND profile_id=$2',[fixture.conversationId,fixture.people[1]])
    await client.query('INSERT INTO public.human_blocks(blocker_profile_id,blocked_profile_id) VALUES($1,$2)',fixture.people)
    const rows = (await client.query('SELECT * FROM public.claim_human_realtime_outbox($1,100,60)',[randomUUID()])).rows.filter(row=>row.event.conversationId===fixture.conversationId)
    expect(rows.filter(row=>row.event.type==='read')).toHaveLength(1)
    expect(rows.find(row=>row.event.type==='read').event).toMatchObject({profileId:fixture.people[1],lastReadSequence:1})
    expect(rows.find(row=>row.event.type==='access_revoked').event).toMatchObject({reason:'blocked'})
  }))
  it('denies worker access and direct insert to product users but permits platform', async () => {
    for (const role of ['aifans_anon','aifans_authenticated']) await transaction(async client => {
      await client.query(`SET LOCAL ROLE ${role}`)
      await expect(client.query('SELECT * FROM public.claim_human_realtime_outbox($1,1,60)',[randomUUID()])).rejects.toThrow(/permission denied/)
    })
    await transaction(async client => {await client.query('SET LOCAL ROLE aifans_platform'); await client.query('SELECT * FROM public.claim_human_realtime_outbox($1,1,60)',[randomUUID()])})
    for (const role of ['aifans_anon','aifans_authenticated','aifans_platform']) await transaction(async client => {
      await client.query(`SET LOCAL ROLE ${role}`)
      await expect(client.query('INSERT INTO public.human_dm_outbox DEFAULT VALUES')).rejects.toThrow(/permission denied/)
    })
  })
  it('reclaims expired leases but stops after ten attempts, including crashed workers', () => transaction(async client => {
    const fixture=await seed(client), lease=randomUUID()
    const id=(await client.query('SELECT id FROM public.human_dm_outbox WHERE message_id=$1',[fixture.messageId])).rows[0].id
    for(let attempt=1;attempt<=10;attempt++) {
      const row=(await client.query('SELECT * FROM public.claim_human_realtime_outbox($1,100,60)',[lease])).rows.find(row=>row.id===id)
      expect(row.attempt_count).toBe(attempt)
      await client.query("UPDATE public.human_dm_outbox SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[id])
      expect((await client.query('SELECT public.acknowledge_human_realtime_outbox($1,$2) AS ok',[id,lease])).rows[0].ok).toBe(false)
    }
    expect((await client.query('SELECT * FROM public.claim_human_realtime_outbox($1,100,60)',[lease])).rows.some(row=>row.id===id)).toBe(false)
    expect((await client.query('SELECT last_error_code,failed_at IS NOT NULL AS failed FROM public.human_dm_outbox WHERE id=$1',[id])).rows[0]).toEqual({last_error_code:'attempts_exhausted',failed:true})
  }))
  it('rejects null and out-of-range claim/retry bounds in SQL', async () => {
    for(const values of [[randomUUID(),null,60],[randomUUID(),101,60],[randomUUID(),1,null],[null,1,60]]) await transaction(async client=>{
      await expect(client.query('SELECT * FROM public.claim_human_realtime_outbox($1,$2,$3)',values)).rejects.toThrow(/invalid human realtime claim/)
    })
    await transaction(async client=>{await expect(client.query("SELECT public.retry_human_realtime_outbox($1,$2,'timeout',NULL)",[randomUUID(),randomUUID()])).rejects.toThrow(/invalid human realtime retry/)})
  })
  it('rolls back read and block events with their original writes', () => transaction(async client=>{
    const fixture=await seed(client)
    await client.query('SAVEPOINT business_write')
    await client.query('UPDATE public.human_dm_members SET read_sequence=1 WHERE conversation_id=$1',[fixture.conversationId])
    await client.query('INSERT INTO public.human_blocks(blocker_profile_id,blocked_profile_id) VALUES($1,$2)',fixture.people)
    await client.query('ROLLBACK TO SAVEPOINT business_write')
    expect((await client.query('SELECT event_type FROM public.human_dm_outbox WHERE conversation_id=$1',[fixture.conversationId])).rows).toEqual([{event_type:'message'}])
  }))
  it('uses SKIP LOCKED for simultaneous claims on committed events', async () => {
    const seedClient=await pool.connect(), first=await pool.connect(), second=await pool.connect()
    let fixture:Awaited<ReturnType<typeof seed>>|undefined
    try {
      fixture=await seed(seedClient)
      await first.query('BEGIN'); await second.query('BEGIN')
      const [a,b]=await Promise.all([first.query('SELECT * FROM public.claim_human_realtime_outbox($1,100,60)',[randomUUID()]),second.query('SELECT * FROM public.claim_human_realtime_outbox($1,100,60)',[randomUUID()])])
      expect([...a.rows,...b.rows].filter(row=>row.event.message?.id===fixture!.messageId)).toHaveLength(1)
    } finally {
      await first.query('ROLLBACK'); await second.query('ROLLBACK')
      if(fixture) await seedClient.query('DELETE FROM public.human_dm_conversations WHERE id=$1',[fixture.conversationId])
      if(fixture) await seedClient.query('DELETE FROM public.profiles WHERE id=ANY($1::uuid[])',[fixture.people])
      seedClient.release();first.release();second.release()
    }
  })
})
