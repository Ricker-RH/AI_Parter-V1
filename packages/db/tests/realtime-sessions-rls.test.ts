import {randomUUID} from 'node:crypto'
import {existsSync, readFileSync} from 'node:fs'
import {Pool, type PoolClient} from 'pg'
import {afterAll, describe, expect, it} from 'vitest'

const migration = new URL('../migrations/202609040007_realtime_sessions.sql', import.meta.url)
const connectionString = process.env.REALTIME_TEST_DATABASE_URL ?? ''
if (connectionString) {
  const url = new URL(connectionString)
  if (!['localhost','127.0.0.1'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/aifans_human_dm_test_v3') throw new Error('Realtime tests require the explicit local scratch database')
}
const pool = new Pool({connectionString})
const integration = connectionString ? describe : describe.skip
type Human = {id:string; subject:string}
async function human(client:PoolClient):Promise<Human> {
  const id=randomUUID(); const subject=`rt-${id}`
  await client.query("INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'Realtime test')",[id,subject,`rt_${id.replaceAll('-','').slice(0,20)}`])
  return {id,subject}
}
async function fixture(run:(c:PoolClient,a:Human,b:Human,other:Human,conversation:string)=>Promise<void>) {
  const c=await pool.connect()
  try {
    await c.query('BEGIN')
    const a=await human(c),b=await human(c),other=await human(c),conversation=randomUUID()
    await c.query('INSERT INTO public.human_dm_conversations(id,low_profile_id,high_profile_id) VALUES($1,least($2::uuid,$3::uuid),greatest($2::uuid,$3::uuid))',[conversation,a.id,b.id])
    await c.query('INSERT INTO public.human_dm_members(conversation_id,profile_id) VALUES($1,$2),($1,$3)',[conversation,a.id,b.id])
    await c.query('SET LOCAL ROLE aifans_platform')
    await run(c,a,b,other,conversation)
  } finally {await c.query('ROLLBACK');c.release()}
}
async function redeem(c:PoolClient,a:Human,id=randomUUID(),ticket:unknown=new Date(Date.now()+45000),expires:unknown=new Date(Date.now()+240000)) {
  return (await c.query('SELECT public.redeem_realtime_session($1,$2,$3,$4,$5) AS allowed',[id,a.subject,a.id,ticket,expires])).rows[0].allowed
}
async function authorize(c:PoolClient,a:Human,id:string,conversation:string) {
  return (await c.query('SELECT * FROM public.authorize_realtime_session($1,$2,$3,$4)',[id,a.subject,a.id,conversation])).rows[0]
}
async function denied(c:PoolClient,sql:string,values:unknown[]=[]) {
  await c.query('SAVEPOINT denied');let error:unknown
  try {await c.query(sql,values)} catch(e) {error=e}
  await c.query('ROLLBACK TO SAVEPOINT denied')
  expect(error).toMatchObject({code:'42501'})
}
describe('realtime session migration',()=>{
  it('exists and forces RLS without direct grants',()=>{
    expect(existsSync(migration)).toBe(true)
    const sql=readFileSync(migration,'utf8')
    expect(sql).toContain('ALTER TABLE public.realtime_sessions FORCE ROW LEVEL SECURITY')
    expect(sql).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL) ON (?:TABLE )?public.realtime_sessions/)
  })
})
integration('durable realtime session PostgreSQL security',()=>{
  it('resolves only opted-in mutual peers, bounds offline grace and revokes immediately',()=>fixture(async(c,a,b,other,conversation)=>{
    const id=randomUUID();await redeem(c,a,id);
    const resolve=async(grace=false,actor=a)=>(await c.query('SELECT public.realtime_ephemeral_recipient($1,$2,$3,$4,$5) AS peer',[id,actor.subject,actor.id,conversation,grace])).rows[0].peer;
    expect(await resolve()).toBeNull();
    await c.query('RESET ROLE');
    await c.query('INSERT INTO public.follows(follower_profile_id,followed_profile_id) VALUES($1,$2),($2,$1)',[a.id,b.id]);
    await c.query('INSERT INTO public.human_social_preferences(profile_id,show_presence) VALUES($1,true),($2,true)',[a.id,b.id]);
    await c.query('SET LOCAL ROLE aifans_platform');
    expect(await resolve()).toBe(b.id);expect(await resolve(false,other)).toBeNull();
    await c.query('RESET ROLE');await c.query("UPDATE public.realtime_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE jti=$1",[id]);await c.query('SET LOCAL ROLE aifans_platform');
    expect(await resolve()).toBeNull();expect(await resolve(true)).toBe(b.id);
    await c.query('RESET ROLE');await c.query('UPDATE public.human_social_preferences SET show_presence=false WHERE profile_id=$1',[b.id]);await c.query('SET LOCAL ROLE aifans_platform');
    expect(await resolve(true)).toBeNull();
    await c.query('RESET ROLE');await c.query('UPDATE public.human_social_preferences SET show_presence=true WHERE profile_id=$1',[b.id]);await c.query("UPDATE public.realtime_sessions SET expires_at=clock_timestamp()-interval '61 seconds' WHERE jti=$1",[id]);await c.query('SET LOCAL ROLE aifans_platform');
    expect(await resolve(true)).toBeNull();
    await c.query('SET LOCAL ROLE aifans_authenticated');await denied(c,'SELECT public.realtime_ephemeral_recipient($1,$2,$3,$4,false)',[id,a.subject,a.id,conversation]);
  }));
  afterAll(()=>pool.end())
  it('permits exactly one redemption across simultaneous platform connections',async()=>{
    const setup=await pool.connect(),left=await pool.connect(),right=await pool.connect()
    let person:Human|undefined
    try {
      person=await human(setup)
      const id=randomUUID()
      await left.query('BEGIN');await right.query('BEGIN')
      await left.query('SET LOCAL ROLE aifans_platform');await right.query('SET LOCAL ROLE aifans_platform')
      const outcomes=await Promise.all([left,right].map(async c=>{
        const result=await redeem(c,person!,id)
        await c.query('COMMIT')
        return result
      }))
      expect(outcomes.sort()).toEqual([false,true])
    } finally {
      await left.query('ROLLBACK');await right.query('ROLLBACK');left.release();right.release()
      if(person) await setup.query('DELETE FROM public.profiles WHERE id=$1',[person.id])
      setup.release()
    }
  })
  it('atomically rejects replay, including an expired or revoked session row',()=>fixture(async(c,a)=>{
    const id=randomUUID()
    expect(await redeem(c,a,id)).toBe(true)
    expect(await redeem(c,a,id)).toBe(false)
    await c.query('RESET ROLE');await c.query("UPDATE public.realtime_sessions SET expires_at=clock_timestamp()-interval '1 second',revoked_at=clock_timestamp() WHERE jti=$1",[id]);await c.query('SET LOCAL ROLE aifans_platform')
    expect(await redeem(c,a,id)).toBe(false)
  }))
  it('rejects mismatched binding, missing values and unbounded or expired lifetimes',()=>fixture(async(c,a,b)=>{
    expect(await redeem(c,{...a,subject:b.subject})).toBe(false)
    for(const ticket of [null,new Date(Date.now()-1000),new Date(Date.now()+70000),'infinity']) expect(await redeem(c,a,randomUUID(),ticket)).toBe(false)
    for(const expires of [null,new Date(Date.now()-1000),new Date(Date.now()+310000),'infinity']) expect(await redeem(c,a,randomUUID(),new Date(Date.now()+45000),expires)).toBe(false)
    for(const values of [[null,a.subject,a.id],[randomUUID(),null,a.id],[randomUUID(),' ',a.id],[randomUUID(),a.subject,null]]) {
      expect((await c.query("SELECT public.redeem_realtime_session($1,$2,$3,clock_timestamp()+interval '45 seconds',clock_timestamp()+interval '4 minutes') AS allowed",values)).rows[0].allowed).toBe(false)
    }
  }))
  it('allows nonmutual member events but defaults presence off and denies foreign identities',()=>fixture(async(c,a,b,other,conversation)=>{
    const id=randomUUID();await redeem(c,a,id)
    expect(await authorize(c,a,id,conversation)).toEqual({allowed:true,presence_allowed:false})
    for(const person of [b,other,{...a,subject:b.subject}]) expect(await authorize(c,person,id,conversation)).toEqual({allowed:false,presence_allowed:false})
    expect(await authorize(c,a,randomUUID(),conversation)).toEqual({allowed:false,presence_allowed:false})
    expect(await authorize(c,a,id,randomUUID())).toEqual({allowed:false,presence_allowed:false})
    for(let missing=0;missing<4;missing++) {
      const values:(string|null)[]=[id,a.subject,a.id,conversation];values[missing]=null
      expect((await c.query('SELECT * FROM public.authorize_realtime_session($1,$2,$3,$4)',values)).rows[0]).toEqual({allowed:false,presence_allowed:false})
    }
    const otherId=randomUUID();await redeem(c,other,otherId)
    expect(await authorize(c,other,otherId,conversation)).toEqual({allowed:false,presence_allowed:false})
  }))
  it('rechecks mutual opt-in, unfollow and blocks on every authorization',()=>fixture(async(c,a,b,_other,conversation)=>{
    const id=randomUUID();await redeem(c,a,id)
    await c.query('RESET ROLE')
    await c.query('INSERT INTO public.follows(follower_profile_id,followed_profile_id) VALUES($1,$2),($2,$1)',[a.id,b.id])
    await c.query('INSERT INTO public.human_social_preferences(profile_id,show_presence) VALUES($1,true),($2,false)',[a.id,b.id])
    await c.query('SET LOCAL ROLE aifans_platform')
    expect((await authorize(c,a,id,conversation)).presence_allowed).toBe(false)
    await c.query('RESET ROLE');await c.query('UPDATE public.human_social_preferences SET show_presence=true WHERE profile_id=$1',[b.id]);await c.query('SET LOCAL ROLE aifans_platform')
    expect(await authorize(c,a,id,conversation)).toEqual({allowed:true,presence_allowed:true})
    await c.query('RESET ROLE');await c.query('DELETE FROM public.follows WHERE follower_profile_id=$1 AND followed_profile_id=$2',[b.id,a.id]);await c.query('SET LOCAL ROLE aifans_platform')
    expect(await authorize(c,a,id,conversation)).toEqual({allowed:true,presence_allowed:false})
    for(const pair of [[a.id,b.id],[b.id,a.id]]) {
      await c.query('RESET ROLE');await c.query('INSERT INTO public.human_blocks(blocker_profile_id,blocked_profile_id) VALUES($1,$2)',pair);await c.query('SET LOCAL ROLE aifans_platform')
      expect(await authorize(c,a,id,conversation)).toEqual({allowed:false,presence_allowed:false})
      await c.query('RESET ROLE');await c.query('DELETE FROM public.human_blocks WHERE blocker_profile_id=$1 AND blocked_profile_id=$2',pair);await c.query('SET LOCAL ROLE aifans_platform')
    }
  }))
  it('denies expired and revoked sessions and lets only an actor revoke their own sessions',()=>fixture(async(c,a,b,_other,conversation)=>{
    const id=randomUUID();await redeem(c,a,id)
    await c.query('SET LOCAL ROLE aifans_authenticated');await c.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:b.subject})])
    expect((await c.query('SELECT public.revoke_own_realtime_sessions() AS count')).rows[0].count).toBe(0)
    await c.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.subject})])
    expect((await c.query('SELECT public.revoke_own_realtime_sessions() AS count')).rows[0].count).toBe(1)
    await c.query('SET LOCAL ROLE aifans_platform');expect((await authorize(c,a,id,conversation)).allowed).toBe(false)
    const expired=randomUUID();await redeem(c,a,expired)
    await c.query('RESET ROLE');await c.query("UPDATE public.realtime_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE jti=$1",[expired]);await c.query('SET LOCAL ROLE aifans_platform')
    expect((await authorize(c,a,expired,conversation)).allowed).toBe(false)
  }))
  it('denies direct storage access even for platform and callable helpers for user/anon',()=>fixture(async(c,a,_b,_other,conversation)=>{
    for(const role of ['aifans_platform','aifans_authenticated','aifans_anon']) {
      await c.query(`SET LOCAL ROLE ${role}`)
      for(const sql of ['SELECT * FROM public.realtime_sessions','INSERT INTO public.realtime_sessions DEFAULT VALUES','DELETE FROM public.realtime_sessions','UPDATE public.realtime_sessions SET revoked_at=now()']) await denied(c,sql)
      if(role!=='aifans_platform') {
        await denied(c,'SELECT public.redeem_realtime_session($1,$2,$3,now(),now())',[randomUUID(),a.subject,a.id])
        await denied(c,'SELECT * FROM public.authorize_realtime_session($1,$2,$3,$4)',[randomUUID(),a.subject,a.id,conversation])
      }
    }
    await denied(c,'SELECT public.revoke_own_realtime_sessions()')
  }))
})
