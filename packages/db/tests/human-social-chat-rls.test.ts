import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

const migration = resolve(import.meta.dirname, '../migrations/202609040005_human_social_chat.sql')
const connectionString = process.env.HUMAN_DM_TEST_DATABASE_URL ?? ''
const pool = new Pool({ connectionString })
const integration = connectionString ? describe : describe.skip
type Human = { id: string; subject: string }
async function human(client: PoolClient): Promise<Human> {
  const id = randomUUID(); const subject = `dm-${id}`
  await client.query("INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'DM test')", [id, subject, `dm_${id.replaceAll('-', '').slice(0,20)}`])
  return { id, subject }
}
async function actor(client: PoolClient, person: Human) {
  await client.query('SET LOCAL ROLE aifans_authenticated')
  await client.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: person.subject })])
}
async function rejects(client: PoolClient, sql: string, values: unknown[] = []) {
  if (sql.includes('human_dm_send') && typeof values[1] === 'string') values[1] = JSON.stringify({kind:'text',text:values[1]})
  await client.query('SAVEPOINT denied')
  let error: unknown
  try { await client.query(sql, values) } catch (caught) { error = caught }
  await client.query('ROLLBACK TO SAVEPOINT denied')
  expect(error).toBeInstanceOf(Error)
  return error
}
async function scenario(run: (client: PoolClient, a: Human, b: Human, c: Human) => Promise<void>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const a = await human(client); const b = await human(client); const c = await human(client)
    await run(client, a, b, c)
  } finally { await client.query('ROLLBACK'); client.release() }
}
async function send(client: PoolClient, target: Human, request = randomUUID(), body = 'hello') {
  return (await client.query('SELECT * FROM public.human_dm_send($1,$2,$3)', [target.id, JSON.stringify({kind:'text',text:body}), request])).rows[0]!
}

describe('human DM migration guardrails', () => {
  it('defines private, forced-RLS storage and bounded session-derived commands', () => {
    expect(existsSync(migration)).toBe(true)
    const sql = readFileSync(migration, 'utf8')
    for (const name of ['human_social_preferences', 'human_dm_conversations', 'human_dm_messages', 'human_dm_members', 'human_blocks', 'human_dm_outbox']) {
      expect(sql).toContain(`CREATE TABLE public.${name}`)
      expect(sql).toContain(`ALTER TABLE public.${name} FORCE ROW LEVEL SECURITY`)
    }
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('first_contact_consumed')
    expect(sql).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL).*TO aifans_authenticated/)
  })
})

integration('human DM real PostgreSQL security', () => {
  afterAll(async () => pool.end())
  it('opening and block/unblock preserve an unused introduction',async()=>scenario(async(client,a,b)=>{
    await actor(client,a)
    const opened = (await client.query('SELECT * FROM public.human_dm_open($1)',[b.id])).rows[0]!
    expect(opened.first_contact_consumed).toBe(false)
    await client.query('SELECT public.human_block_profile($1)',[b.id])
    expect(await rejects(client,'SELECT * FROM public.human_dm_send($1,$2,$3)',[b.id,'blocked',randomUUID()])).toMatchObject({code:'PDM01'})
    await client.query('SELECT public.human_unblock_profile($1)',[b.id])
    expect((await send(client,b)).sequence).toBe('1')
    expect(await rejects(client,'SELECT * FROM public.human_dm_send($1,$2,$3)',[b.id,'second',randomUUID()])).toMatchObject({code:'PDM02'})
  }))
  it('strictly gates unvalidated media and rejects malformed text',async()=>scenario(async(client,a,b)=>{
    await actor(client,a)
    for(const content of [{kind:'text',text:' '},{kind:'text',text:'x'.repeat(4001)},{kind:'text',text:'x',senderProfileId:b.id},{kind:'image',attachmentId:randomUUID()},{kind:'voice',attachmentId:randomUUID()},{kind:'sticker',stickerId:'untrusted'},{kind:'share',target:{kind:'post',id:randomUUID()}},{}]) {
      expect(await rejects(client,'SELECT * FROM public.human_dm_send($1,$2,$3)',[b.id,content,randomUUID()])).toMatchObject({code:'22023'})
    }
  }))
  it('rejects missing or JSON-null content keys at the storage constraint as well',async()=>scenario(async(client,a,b)=>{
    await actor(client,a);const message=await send(client,b);await client.query('RESET ROLE')
    for(const content of [{},{kind:'text'},{text:'x'},{kind:null,text:'x'},{kind:'text',text:null}]) {
      expect(await rejects(client,'INSERT INTO public.human_dm_messages(conversation_id,sender_profile_id,sequence,content,client_request_id) VALUES($1,$2,2,$3,$4)',[message.conversation_id,a.id,content,randomUUID()])).toMatchObject({code:'23514'})
    }
  }))
  it('serializes opposite-direction first-send races and block-before-send',async()=>{
    const fixture=await pool.connect(); const left=await pool.connect(); const right=await pool.connect()
    const people: Human[]=[]
    try {
      people.push(await human(fixture),await human(fixture))
      const [a,b]=people as [Human,Human]
      await left.query('BEGIN'); await right.query('BEGIN'); await actor(left,a); await actor(right,b)
      const race = await Promise.allSettled([
        send(left,b).then(async row=>{await left.query('COMMIT');return row}),
        send(right,a).then(async row=>{await right.query('COMMIT');return row}),
      ])
      expect(race.filter(x=>x.status==='fulfilled')).toHaveLength(1)
      expect(race.find(x=>x.status==='rejected')).toMatchObject({reason:{code:'PDM02'}})
      await left.query('ROLLBACK'); await right.query('ROLLBACK')
      await left.query('BEGIN');await actor(left,a);await left.query('SELECT public.human_follow_profile($1)',[b.id]);await left.query('COMMIT')
      await right.query('BEGIN');await actor(right,b);await right.query('SELECT public.human_follow_profile($1)',[a.id]);await right.query('COMMIT')
      await left.query('BEGIN');await actor(left,a);await left.query('SELECT public.human_block_profile($1)',[b.id])
      await right.query('BEGIN');await actor(right,b)
      const pending=send(right,a).then(()=>null,error=>error)
      await left.query('COMMIT')
      expect(await pending).toMatchObject({code:'PDM01'})
      await right.query('ROLLBACK')
      expect((await fixture.query('SELECT count(*) FROM public.human_dm_messages WHERE sender_profile_id=ANY($1::uuid[])',[people.map(x=>x.id)])).rows[0].count).toBe('1')
    } finally {
      await left.query('ROLLBACK');await right.query('ROLLBACK');left.release();right.release()
      await fixture.query('DELETE FROM public.notifications WHERE actor_profile_id=ANY($1::uuid[]) OR recipient_profile_id=ANY($1::uuid[])',[people.map(x=>x.id)])
      await fixture.query('DELETE FROM public.profiles WHERE id=ANY($1::uuid[])',[people.map(x=>x.id)]);fixture.release()
    }
  })
  it('allows one total stranger message, deduplicates retries, and requires mutual follows thereafter', async () => scenario(async (client,a,b) => {
    await actor(client,a); const request = randomUUID(); const first = await send(client,b,request)
    expect((await send(client,b,request)).id).toBe(first.id)
    await rejects(client,'SELECT * FROM public.human_dm_send($1,$2,$3)',[b.id,'changed',request])
    await rejects(client,'SELECT * FROM public.human_dm_send($1,$2,$3)',[b.id,'again',randomUUID()])
    await actor(client,b)
    await rejects(client,'SELECT * FROM public.human_dm_send($1,$2,$3)',[a.id,'reply',randomUUID()])
    await client.query('SELECT public.human_follow_profile($1)',[a.id])
    await actor(client,a); await client.query('SELECT public.human_follow_profile($1)',[b.id])
    expect((await send(client,b)).sequence).toBe('2')
    await rejects(client,'SELECT * FROM public.human_dm_outbox')
  }))
  it('denies third party reads, all direct writes, and forged actor configuration', async () => scenario(async(client,a,b,c) => {
    await actor(client,a); const first = await send(client,b)
    await actor(client,c)
    for (const table of ['human_dm_conversations','human_dm_messages','human_dm_members','human_social_preferences','human_blocks']) {
      expect((await client.query(`SELECT * FROM public.${table}`)).rowCount).toBe(0)
      expect(await rejects(client,`DELETE FROM public.${table}`)).toMatchObject({code:'42501'})
      expect(await rejects(client,`INSERT INTO public.${table} DEFAULT VALUES`)).toMatchObject({code:'42501'})
    }
    expect(await rejects(client,'UPDATE public.human_dm_messages SET content=$1 WHERE id=$2',[{kind:'text',text:'forged'},first.id])).toMatchObject({code:'42501'})
    expect(await rejects(client,'UPDATE public.human_dm_members SET read_sequence=10')).toMatchObject({code:'42501'})
    expect(await rejects(client,'UPDATE public.human_dm_conversations SET first_contact_consumed=false')).toMatchObject({code:'42501'})
    await rejects(client,'INSERT INTO public.follows(follower_profile_id,followed_profile_id) VALUES($1,$2)',[a.id,b.id])
    await client.query("SELECT set_config('app.profile_id',$1,true)",[a.id])
    await rejects(client,'SELECT public.human_dm_mark_read($1,1)',[first.conversation_id])
    await client.query("SELECT set_config('request.jwt.claims','{}',true)")
    await rejects(client,'SELECT * FROM public.human_dm_send($1,$2,$3)',[a.id,'forged',randomUUID()])
    await client.query('SET LOCAL ROLE aifans_anon')
    expect(await rejects(client,'SELECT * FROM public.human_dm_messages')).toMatchObject({code:'42501'})
    expect(await rejects(client,'SELECT * FROM public.human_dm_send($1,$2,$3)',[a.id,'anonymous',randomUUID()])).toMatchObject({code:'42501'})
  }))
  it('does not let a third party with their own conversation read another pair',async()=>scenario(async(client,a,b,c)=>{
    const d=await human(client);await actor(client,a);const other=await send(client,b)
    await actor(client,c);const own=await send(client,d)
    expect((await client.query('SELECT id FROM public.human_dm_conversations')).rows).toEqual([{id:own.conversation_id}])
    expect((await client.query('SELECT id FROM public.human_dm_messages')).rows).toEqual([{id:own.id}])
    expect((await client.query('SELECT conversation_id FROM public.human_dm_members')).rows).toEqual([{conversation_id:own.conversation_id},{conversation_id:own.conversation_id}])
    expect(await rejects(client,'SELECT public.human_dm_mark_read($1,1)',[other.conversation_id])).toMatchObject({code:'42501'})
  }))
  it('deduplicates concurrent identical retries into one message and outbox row',async()=>{
    const fixture=await pool.connect();const left=await pool.connect();const right=await pool.connect();const people:Human[]=[]
    try {
      people.push(await human(fixture),await human(fixture));const [a,b]=people as [Human,Human];const request=randomUUID()
      await left.query('BEGIN');await right.query('BEGIN');await actor(left,a);await actor(right,a)
      const messages=await Promise.all([send(left,b,request).then(async row=>{await left.query('COMMIT');return row}),send(right,b,request).then(async row=>{await right.query('COMMIT');return row})])
      expect(messages[0].id).toBe(messages[1].id)
      expect((await fixture.query('SELECT count(*) FROM public.human_dm_outbox WHERE message_id=$1',[messages[0].id])).rows[0].count).toBe('1')
    } finally {
      await left.query('ROLLBACK');await right.query('ROLLBACK');left.release();right.release()
      await fixture.query('DELETE FROM public.profiles WHERE id=ANY($1::uuid[])',[people.map(x=>x.id)]);fixture.release()
    }
  })
  it('unfollow is idempotent and cannot restore a spent allowance',async()=>scenario(async(client,a,b)=>{
    await actor(client,a);await client.query('SELECT public.human_follow_profile($1)',[b.id])
    await actor(client,b);await client.query('SELECT public.human_follow_profile($1)',[a.id]);await send(client,a)
    expect((await client.query('SELECT public.human_unfollow_profile($1) AS changed',[a.id])).rows[0].changed).toBe(true)
    expect((await client.query('SELECT public.human_unfollow_profile($1) AS changed',[a.id])).rows[0].changed).toBe(false)
    expect(await rejects(client,'SELECT * FROM public.human_dm_send($1,$2,$3)',[a.id,'no mutual',randomUUID()])).toMatchObject({code:'PDM02'})
  }))
  it('block removes both follows; unblock cannot reset the consumed allowance',async()=>scenario(async(client,a,b)=>{
    await actor(client,a); await send(client,b); await client.query('SELECT public.human_follow_profile($1)',[b.id])
    await actor(client,b); await client.query('SELECT public.human_follow_profile($1)',[a.id])
    await client.query('SELECT public.human_block_profile($1)',[a.id])
    await rejects(client,'SELECT * FROM public.human_dm_send($1,$2,$3)',[a.id,'blocked',randomUUID()])
    await actor(client,a); await rejects(client,'SELECT public.human_follow_profile($1)',[b.id])
    await actor(client,b); await client.query('SELECT public.human_unblock_profile($1)',[a.id])
    await rejects(client,'SELECT * FROM public.human_dm_send($1,$2,$3)',[a.id,'still consumed',randomUUID()])
    await client.query('RESET ROLE')
    expect((await client.query('SELECT count(*) FROM public.follows WHERE follower_profile_id=ANY($1::uuid[]) AND followed_profile_id=ANY($1::uuid[])',[[a.id,b.id]])).rows[0].count).toBe('0')
  }))
  it('read cursors are monotonic, bounded, and actor-owned; preferences are owner-only',async()=>scenario(async(client,a,b)=>{
    await actor(client,a); const first = await send(client,b)
    await actor(client,b)
    expect((await client.query('SELECT public.human_dm_mark_read($1,1) AS cursor',[first.conversation_id])).rows[0].cursor).toBe('1')
    expect((await client.query('SELECT public.human_dm_mark_read($1,0) AS cursor',[first.conversation_id])).rows[0].cursor).toBe('1')
    await rejects(client,'SELECT public.human_dm_mark_read($1,2)',[first.conversation_id])
    await client.query("SELECT public.human_set_preferences('private',false)")
    expect((await client.query('SELECT * FROM public.human_social_preferences')).rowCount).toBe(1)
  }))
})
