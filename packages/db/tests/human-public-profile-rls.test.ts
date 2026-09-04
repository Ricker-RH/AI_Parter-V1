import {randomUUID} from 'node:crypto'
import {Pool, type PoolClient} from 'pg'
import {afterAll,describe,expect,it} from 'vitest'
const url=process.env.HUMAN_DM_TEST_DATABASE_URL
const pool=new Pool({connectionString:url})
const integration=url?describe:describe.skip
async function actor(c:PoolClient,id:string){await c.query('SET LOCAL ROLE aifans_authenticated');await c.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id})])}
async function scenario(run:(c:PoolClient,a:string,b:string)=>Promise<void>){const c=await pool.connect();try{await c.query('BEGIN');const a=randomUUID(),b=randomUUID();for(const id of [a,b])await c.query("INSERT INTO profiles(id,auth_subject,account_kind,username,display_name,bio) VALUES($1::uuid,$1::text,'human',$2,'Person','Bio')",[id,`h_${id.replaceAll('-','').slice(0,20)}`]);await run(c,a,b)}finally{await c.query('ROLLBACK');c.release()}}
async function profile(c:PoolClient,id:string){return(await c.query('SELECT * FROM public.human_public_profile($1)',[id])).rows[0]}
async function denied(c:PoolClient,sql:string,values:unknown[]=[]){await c.query('SAVEPOINT denied');let error;try{await c.query(sql,values)}catch(caught){error=caught}await c.query('ROLLBACK TO SAVEPOINT denied');expect(error).toMatchObject({code:'42501'})}
integration('public HUMAN profile boundaries',()=>{
 afterAll(()=>pool.end())
 it('anonymous private basic projection has no activity, presence or authentication data',()=>scenario(async(c,a)=>{
  await c.query('SET LOCAL ROLE aifans_anon');const p=await profile(c,a)
  expect(p).toMatchObject({id:a,bio:'Bio',profile_visibility:'private',is_owner:false,tabs_available:false,message_disabled_reason:'authentication_required'})
  expect(Object.keys(p).some(k=>/count|cursor|subject|presence|sequence|consumed/.test(k))).toBe(false)
  expect(await profile(c,randomUUID())).toBeUndefined()
 }))
 it('owner tabs stay available; private visitors lock; public visibility updates atomically preserve presence',()=>scenario(async(c,a,b)=>{
  await actor(c,a);expect(await profile(c,a)).toMatchObject({is_owner:true,tabs_available:true,message_disabled_reason:'self'})
  await c.query("SELECT public.human_set_preferences('public',true)")
  await c.query("SELECT public.human_set_preferences('private',NULL)")
  expect((await c.query('SELECT * FROM human_social_preferences')).rows[0]).toMatchObject({profile_visibility:'private',show_presence:true})
  await c.query('SELECT public.human_set_preferences(NULL,false)')
  await actor(c,b);expect(await profile(c,a)).toMatchObject({tabs_available:false,message_disabled_reason:null})
  await actor(c,a);await c.query("SELECT public.human_set_preferences('public',NULL)")
  await actor(c,b);expect(await profile(c,a)).toMatchObject({tabs_available:true})
 }))
 it('spent first contact requires mutual follow; both block directions disable messaging',()=>scenario(async(c,a,b)=>{
  await actor(c,a);await c.query('SELECT public.human_dm_send($1,$2,$3)',[b,{kind:'text',text:'Hello'},randomUUID()])
  expect(await profile(c,b)).toMatchObject({message_disabled_reason:'mutual_follow_required'})
  await c.query('SELECT public.human_follow_profile($1)',[b]);await actor(c,b);await c.query('SELECT public.human_follow_profile($1)',[a])
  expect(await profile(c,a)).toMatchObject({following:true,followed_by:true,message_disabled_reason:null})
  await c.query('SELECT public.human_block_profile($1)',[a]);expect(await profile(c,a)).toMatchObject({blocked_by_viewer:true,message_disabled_reason:'blocked',tabs_available:false})
  await actor(c,a);expect(await profile(c,b)).toMatchObject({blocked_by_viewer:false,message_disabled_reason:'blocked'})
 }))
 it('follow notifications are transactional and idempotent without deleting historical notices',()=>scenario(async(c,a,b)=>{
  await actor(c,a);await c.query('SELECT public.human_follow_profile($1)',[b]);await c.query('SELECT public.human_follow_profile($1)',[b]);await c.query('SELECT public.human_block_profile($1)',[b]);await c.query('RESET ROLE')
  expect((await c.query("SELECT count(*) FROM notifications WHERE actor_profile_id=$1 AND recipient_profile_id=$2 AND kind='follow'",[a,b])).rows[0].count).toBe('1')
 }))
 it('anonymous role has no commands and cannot forge ownership with unrelated settings',()=>scenario(async(c,a,b)=>{
  await actor(c,b);await c.query("SELECT set_config('app.profile_id',$1,true)",[a]);expect(await profile(c,a)).toMatchObject({is_owner:false})
  await c.query('SET LOCAL ROLE aifans_anon');await c.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a})])
  expect(await profile(c,a)).toMatchObject({is_owner:false,tabs_available:false,message_disabled_reason:'authentication_required'})
  expect((await c.query("SELECT has_function_privilege('aifans_anon','public.human_set_preferences(text,boolean)','EXECUTE') AS allowed")).rows[0].allowed).toBe(false)
  expect((await c.query("SELECT has_function_privilege('aifans_anon','public.human_follow_profile(uuid)','EXECUTE') AS allowed")).rows[0].allowed).toBe(false)
  for(const name of ['follow','unfollow','block','unblock'])await denied(c,`SELECT public.human_${name}_profile($1)`,[a])
  await denied(c,"SELECT public.human_set_preferences('public',true)")
  await denied(c,'SELECT * FROM public.human_social_preferences')
  await denied(c,'SELECT * FROM public.human_blocks')
 }))
 it('does not expose IP accounts through HUMAN projection',()=>scenario(async(c)=>{
  const ip=randomUUID();await c.query("INSERT INTO profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'AI')",[ip,`ip_${ip.replaceAll('-','').slice(0,20)}`])
  await c.query('SET LOCAL ROLE aifans_anon');expect(await profile(c,ip)).toBeUndefined()
 }))
})
