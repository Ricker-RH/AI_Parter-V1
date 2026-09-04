import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {afterAll,describe,it,expect} from 'vitest'
const pool=new Pool({connectionString:process.env.HUMAN_DM_TEST_DATABASE_URL})
;(process.env.HUMAN_DM_TEST_DATABASE_URL?describe:describe.skip)('owner-only AI realtime and durable generation invalidations',()=>{
 afterAll(()=>pool.end())
 it('authorizes only a live owner session and emits bounded transition events without answer data',async()=>{
  const c=await pool.connect()
  try{
   await c.query('BEGIN')
   const [owner,other,ip,conversation,message,session,otherSession]=Array.from({length:7},()=>randomUUID())
   for(const id of [owner,other])await c.query("INSERT INTO profiles(id,auth_subject,account_kind,username,display_name) VALUES($1::uuid,$1::text,'human',$2,'AI owner')",[id,`air_${id!.replaceAll('-','').slice(0,18)}`])
   await c.query("INSERT INTO profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'AI')",[ip,`air_${ip!.replaceAll('-','').slice(0,18)}`])
   await c.query('INSERT INTO chat_conversations(id,human_profile_id,ip_profile_id) VALUES($1,$2,$3)',[conversation,owner,ip])
   for(const [id,profile]of [[session,owner],[otherSession,other]])await c.query('SELECT public.redeem_realtime_session($1,$2,$3,now()+interval\'45 seconds\',now()+interval\'4 minutes\')',[id,profile,profile])
   const authorize=async(s:string|undefined,p:string|undefined)=>(await c.query('SELECT * FROM public.authorize_ai_realtime_session($1,$2,$3,$4)',[s,p,p,conversation])).rows[0].allowed
   expect(await authorize(session,owner)).toBe(true);expect(await authorize(otherSession,other)).toBe(false);expect(await authorize(session,other)).toBe(false)
   await c.query("INSERT INTO chat_messages(id,conversation_id,role,body,client_request_id,generation_state,generation_answer) VALUES($1,$2,'human','Question',$3,'generating','')",[message,conversation,randomUUID()])
   await c.query("UPDATE chat_messages SET generation_state='partial',generation_answer='secret checkpoint' WHERE id=$1",[message])
   await c.query("UPDATE chat_messages SET generation_answer='more secret checkpoint' WHERE id=$1",[message])
   expect((await c.query('SELECT count(*)::int AS n FROM ai_chat_outbox WHERE message_id=$1',[message])).rows[0].n).toBe(2)
   await c.query('UPDATE realtime_sessions SET revoked_at=now() WHERE jti=$1',[session]);expect(await authorize(session,owner)).toBe(false)
   await c.query('SET LOCAL ROLE aifans_platform')
   const token=randomUUID(),rows=(await c.query('SELECT * FROM public.claim_ai_realtime_outbox($1,100,60)',[token])).rows.filter(r=>r.event.conversationId===conversation)
   expect(rows).toHaveLength(2)
   for(const row of rows){expect(row.recipient_profile_ids).toEqual([owner]);expect(row.event.type).toBe('ai_generation');expect(row.event.messageId).toBe(message);expect(JSON.stringify(row.event)).not.toMatch(/secret|answer|body|subject/)}
   expect((await c.query('SELECT public.acknowledge_ai_realtime_outbox($1,$2) AS ok',[rows[0].id,randomUUID()])).rows[0].ok).toBe(false)
   expect((await c.query('SELECT public.acknowledge_ai_realtime_outbox($1,$2) AS ok',[rows[0].id,token])).rows[0].ok).toBe(true)
   await c.query('SET LOCAL ROLE aifans_authenticated');await c.query('SAVEPOINT denied')
   await expect(c.query('SELECT * FROM public.claim_ai_realtime_outbox($1,1,60)',[token])).rejects.toMatchObject({code:'42501'})
   await c.query('ROLLBACK TO SAVEPOINT denied')
  }finally{await c.query('ROLLBACK');c.release()}
 })
 it('reconciles stale pending generations once, preserving partial answer and leaving fresh work alone',async()=>{
  const c=await pool.connect()
  try{
   await c.query('BEGIN')
   const [owner,ip,conversation,stale,fresh]=Array.from({length:5},()=>randomUUID())
   await c.query("INSERT INTO profiles(id,auth_subject,account_kind,username,display_name) VALUES($1::uuid,$1::text,'human',$2,'Owner')",[owner,`ais_${owner!.replaceAll('-','').slice(0,18)}`])
   await c.query("INSERT INTO profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'AI')",[ip,`ais_${ip!.replaceAll('-','').slice(0,18)}`])
   await c.query('INSERT INTO chat_conversations(id,human_profile_id,ip_profile_id) VALUES($1,$2,$3)',[conversation,owner,ip])
   for(const [id,age]of [[stale,180],[fresh,0]])await c.query("INSERT INTO chat_messages(id,conversation_id,role,body,client_request_id,generation_state,generation_answer,created_at) VALUES($1,$2,'human','Question',$3,'partial','Saved answer',now()-$4*interval '1 second')",[id,conversation,randomUUID(),age])
   await c.query('SELECT public.reconcile_stale_ai_generations(20)')
   expect((await c.query('SELECT generation_state,generation_answer,delivery_state FROM chat_messages WHERE id=$1',[stale])).rows[0]).toEqual({generation_state:'failed',generation_answer:'Saved answer',delivery_state:'failed'})
   expect((await c.query('SELECT generation_state FROM chat_messages WHERE id=$1',[fresh])).rows[0].generation_state).toBe('partial')
   await c.query('SELECT public.reconcile_stale_ai_generations(20)')
   expect((await c.query("SELECT count(*)::int AS n FROM ai_chat_outbox WHERE message_id=$1 AND generation_state='failed'",[stale])).rows[0].n).toBe(1)
  }finally{await c.query('ROLLBACK');c.release()}
 })
})
