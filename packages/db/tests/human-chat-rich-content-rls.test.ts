import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {afterAll,describe,it,expect} from 'vitest'
const pool=new Pool({connectionString:process.env.HUMAN_DM_TEST_DATABASE_URL})
;(process.env.HUMAN_DM_TEST_DATABASE_URL?describe:describe.skip)('HUMAN stickers and internal shares in PostgreSQL',()=>{
 afterAll(()=>pool.end())
 it('validates catalogue, share visibility, recipient blocks and current resolution with quota/idempotency intact',async()=>{
  const c=await pool.connect()
  try{
   await c.query('BEGIN')
   const [a,b,other,ip,identity,post,draft]=Array.from({length:7},()=>randomUUID())
   for(const id of [a,b,other])await c.query("INSERT INTO profiles(id,auth_subject,account_kind,username,display_name) VALUES($1::uuid,$1::text,'human',$2,'Basic Human')",[id,`rich_${id!.replaceAll('-','').slice(0,18)}`])
   await c.query("INSERT INTO profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'IP')",[ip,`rich_${ip!.replaceAll('-','').slice(0,18)}`])
   await c.query("INSERT INTO ip_profiles(profile_id,source,operation_enabled) VALUES($1,'platform',true)",[ip])
   await c.query("INSERT INTO ip_identity_revisions(id,ip_profile_id,version,display_name) VALUES($1,$2,1,'Published IP')",[identity,ip])
   await c.query("UPDATE ip_profiles SET current_identity_revision_id=$1,public_state='published' WHERE profile_id=$2",[identity,ip])
   await c.query("INSERT INTO posts(id,author_profile_id,source,state,body,published_at) VALUES($1,$2,'worker','published','Server-owned post',now())",[post,ip])
   await c.query("INSERT INTO posts(id,author_profile_id,source,state,body) VALUES($1,$2,'worker','draft','Secret draft')",[draft,ip])
   const actor=async(id:string|undefined)=>{await c.query('SET LOCAL ROLE aifans_authenticated');await c.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id})])}
   const denied=async(sql:string,args:unknown[]=[])=>{await c.query('SAVEPOINT denied');let error;try{await c.query(sql,args)}catch(e){error=e}await c.query('ROLLBACK TO SAVEPOINT denied');expect(error).toBeInstanceOf(Error);return error}
   const send=(peer:string|undefined,content:unknown,request=randomUUID())=>c.query('SELECT * FROM public.human_dm_send($1,$2,$3)',[peer,JSON.stringify(content),request])
   await actor(a)
   expect(await denied('SELECT public.human_dm_share_card($1,$2,$3)',['post',post,b])).toMatchObject({code:'42501'})
   expect((await c.query("SELECT public.human_dm_resolve_share('post',$1) AS value",[draft])).rows[0].value).toEqual({state:'unavailable'})
   expect((await c.query("SELECT public.human_dm_resolve_share('human',$1) AS value",[b])).rows[0].value).toMatchObject({state:'available',card:{title:'Basic Human'}})
   const cards=(await c.query("SELECT public.human_dm_share_targets('post','Server',20) AS value")).rows
   expect(cards).toHaveLength(1);expect(cards[0].value).toMatchObject({target:{kind:'post',id:post},title:'Server-owned post'})
   for(const content of [{kind:'sticker',stickerId:'untrusted'},{kind:'share',target:{kind:'post',id:draft}},{kind:'share',target:{kind:'post',id:post},title:'forged'},{kind:'text',text:' '}])expect(await denied('SELECT * FROM public.human_dm_send($1,$2,$3)',[b,JSON.stringify(content),randomUUID()])).toMatchObject({code:'22023'})
   const sticker={kind:'sticker',stickerId:'wave'},stickerRequest=randomUUID()
   const saved=(await send(b,sticker,stickerRequest)).rows[0]
   expect((await send(b,sticker,stickerRequest)).rows[0].id).toBe(saved.id)
   expect(await denied('SELECT * FROM public.human_dm_send($1,$2,$3)',[b,JSON.stringify(sticker),randomUUID()])).toMatchObject({code:'PDM02'})
   const share={kind:'share',target:{kind:'post',id:post}},shareRequest=randomUUID()
   const shared=(await send(other,share,shareRequest)).rows[0]
   expect(shared.content).toEqual(share)
   await c.query('RESET ROLE');await c.query("UPDATE posts SET state='withdrawn',withdrawn_at=now() WHERE id=$1",[post]);await actor(a)
   expect((await c.query("SELECT public.human_dm_resolve_share('post',$1) AS value",[post])).rows[0].value).toEqual({state:'unavailable'})
   expect((await send(other,share,shareRequest)).rows[0].id).toBe(shared.id)
   await actor(b);await c.query('SELECT public.human_block_profile($1)',[other]);await actor(a)
   expect(await denied('SELECT * FROM public.human_dm_send($1,$2,$3)',[b,JSON.stringify({kind:'share',target:{kind:'human',id:other}}),randomUUID()])).toMatchObject({code:'22023'})
   await actor(b);expect((await c.query("SELECT public.human_dm_resolve_share('human',$1) AS value",[other])).rows[0].value).toEqual({state:'unavailable'})
  }finally{await c.query('ROLLBACK');c.release()}
 })
})
