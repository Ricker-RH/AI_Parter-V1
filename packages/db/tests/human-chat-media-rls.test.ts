import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {afterAll,describe,it,expect} from 'vitest'
const connectionString=process.env.HUMAN_DM_TEST_DATABASE_URL
const pool=new Pool({connectionString})
const suite=connectionString?describe:describe.skip
suite('private HUMAN attachment PostgreSQL authorization',()=>{
 afterAll(()=>pool.end())
 it('denies forgery, binds peer, consumes once and keeps participant-only reads',async()=>{
  const c=await pool.connect()
  try {
   await c.query('BEGIN')
   const ids=[randomUUID(),randomUUID(),randomUUID()]
   for(const id of ids) await c.query("INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'media')",[id,`media-${id}`,`m_${id.replaceAll('-','').slice(0,20)}`])
   const actor=async(index:number,role='aifans_authenticated')=>{await c.query(`SET LOCAL ROLE ${role}`);await c.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:`media-${ids[index]}`})])}
   const denied=async(sql:string,args:unknown[]=[])=>{await c.query('SAVEPOINT denied');let e;try{await c.query(sql,args)}catch(error){e=error}await c.query('ROLLBACK TO SAVEPOINT denied');expect(e).toBeInstanceOf(Error);return e}
   await actor(0)
   const reservation=(await c.query("SELECT * FROM public.human_dm_reserve_attachment($1,'image','image/png',100)",[ids[1]])).rows[0]
   const aid=reservation.id
   expect(await denied("SELECT * FROM public.human_dm_confirm_attachment($1,'image/webp',90,10,10,NULL)",[aid])).toMatchObject({code:'42501'})
   const content=JSON.stringify({kind:'image',attachmentId:aid})
   expect(await denied('SELECT * FROM public.human_dm_send($1,$2,$3)',[ids[1],content,randomUUID()])).toMatchObject({code:'22023'})
   await actor(2)
   expect(await denied('SELECT * FROM public.human_dm_get_attachment($1,true)',[aid])).toMatchObject({code:'P0002'})
   await actor(0,'aifans_platform')
   await c.query("SELECT * FROM public.human_dm_confirm_attachment($1,'image/webp',90,10,10,NULL)",[aid])
   await actor(0)
   expect(await denied('SELECT * FROM public.human_dm_send($1,$2,$3)',[ids[2],content,randomUUID()])).toMatchObject({code:'22023'})
   const request=randomUUID()
   const message=(await c.query('SELECT * FROM public.human_dm_send($1,$2,$3)',[ids[1],content,request])).rows[0]
   expect(message.sequence).toBe('1')
   expect((await c.query('SELECT * FROM public.human_dm_send($1,$2,$3)',[ids[1],content,request])).rows[0].id).toBe(message.id)
   expect(await denied('SELECT * FROM public.human_dm_send($1,$2,$3)',[ids[1],content,randomUUID()])).toMatchObject({code:'22023'})
   expect(await denied("SELECT * FROM public.human_dm_reserve_attachment($1,'voice','audio/webm',100)",[ids[1]])).toMatchObject({code:'PDM02'})
   await actor(1)
   expect((await c.query('SELECT * FROM public.human_dm_get_attachment($1,true)',[aid])).rows[0].id).toBe(aid)
   expect(await denied('SELECT * FROM public.human_dm_get_attachment($1,false)',[aid])).toMatchObject({code:'P0002'})
   await c.query('SELECT public.human_block_profile($1)',[ids[0]])
   await actor(0)
   expect(await denied("SELECT * FROM public.human_dm_reserve_attachment($1,'image','image/png',100)",[ids[1]])).toMatchObject({code:'PDM01'})
   expect(await denied('SELECT * FROM public.human_dm_get_attachment($1,false)',[aid])).toMatchObject({code:'PDM01'})
   expect(await denied('SELECT * FROM public.human_dm_send($1,$2,$3)',[ids[1],content,request])).toMatchObject({code:'PDM01'})
   expect(await denied('SELECT * FROM public.human_dm_attachments')).toMatchObject({code:'42501'})
  }finally{await c.query('ROLLBACK');c.release()}
 })
})
