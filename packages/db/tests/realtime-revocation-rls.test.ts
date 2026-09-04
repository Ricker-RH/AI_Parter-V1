import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {afterAll,describe,expect,it} from 'vitest'
const connectionString=process.env.REALTIME_TEST_DATABASE_URL??''
if(connectionString){const u=new URL(connectionString);if(!['localhost','127.0.0.1'].includes(u.hostname)||u.port!=='55432'||u.pathname!=='/aifans_human_dm_test_v3')throw Error('Scratch database only')}
const pool=new Pool({connectionString})
const integration=connectionString?describe:describe.skip
integration('logout ticket revocation cutoff',()=>{
 it('serializes pending redemption behind logout and denies both explicit and legacy old tickets',async()=>{
  const id=randomUUID(),subject=`logout-${id}`,a=await pool.connect(),b=await pool.connect()
  try{
   await a.query("INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'Logout test')",[id,subject,`lo_${id.replaceAll('-','').slice(0,20)}`])
   const issued=new Date(Date.now()-1000),expiry=new Date(issued.getTime()+60000),sessionExpiry=new Date(Date.now()+240000)
   await a.query('BEGIN');await a.query('SET LOCAL ROLE aifans_authenticated');await a.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:subject})])
   expect((await a.query('SELECT public.revoke_own_realtime_sessions() AS n')).rows[0].n).toBe(0)
   await b.query('BEGIN');await b.query('SET LOCAL ROLE aifans_platform')
   let settled=false
   const pending=b.query('SELECT public.redeem_realtime_session($1,$2,$3,$4,$5,$6) AS allowed',[randomUUID(),subject,id,expiry,sessionExpiry,issued]).then(r=>{settled=true;return r},error=>{settled=true;return {rows:[{error}]}})
   // Observe actual lock wait, not a timing-dependent sleep assertion.
   for(let tries=0;tries<100&&!settled;tries++){
    const waiting=await pool.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",[(b as unknown as {processID:number}).processID])
    if(waiting.rowCount)break
    if(tries===99)throw Error('Redemption did not wait on revoke')
   }
   expect(settled).toBe(false)
   await a.query('COMMIT');expect((await pending).rows[0].allowed).toBe(false)
   expect((await b.query('SELECT public.redeem_realtime_session($1,$2,$3,$4,$5) AS allowed',[randomUUID(),subject,id,expiry,sessionExpiry])).rows[0].allowed).toBe(false)
   expect((await b.query("SELECT public.redeem_realtime_session($1,$2,$3,clock_timestamp()+interval '45 seconds',$4,clock_timestamp()) AS allowed",[randomUUID(),subject,id,sessionExpiry])).rows[0].allowed).toBe(true)
   await b.query('COMMIT')
  }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');await a.query('RESET ROLE');await a.query('DELETE FROM public.profiles WHERE id=$1',[id]);a.release();b.release()}
 })
 it('revokes a redemption that wins the owner lock first',async()=>{
  const id=randomUUID(),subject=`logout-${id}`,sessionId=randomUUID(),a=await pool.connect(),b=await pool.connect()
  try{
   await a.query("INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'Logout test')",[id,subject,`lo_${id.replaceAll('-','').slice(0,20)}`])
   await a.query('BEGIN');await a.query('SET LOCAL ROLE aifans_platform')
   expect((await a.query("SELECT public.redeem_realtime_session($1,$2,$3,clock_timestamp()+interval '60 seconds',clock_timestamp()+interval '300 seconds',clock_timestamp()) AS allowed",[sessionId,subject,id])).rows[0].allowed).toBe(true)
   await b.query('BEGIN');await b.query('SET LOCAL ROLE aifans_authenticated');await b.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:subject})])
   let settled=false
   const pending=b.query('SELECT public.revoke_own_realtime_sessions() AS n').then(r=>{settled=true;return r})
   for(let tries=0;tries<100&&!settled;tries++){
    const waiting=await pool.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",[(b as unknown as {processID:number}).processID])
    if(waiting.rowCount)break
    if(tries===99)throw Error('Revoke did not wait on redemption')
   }
   expect(settled).toBe(false);await a.query('COMMIT')
   expect((await pending).rows[0].n).toBe(1);await b.query('COMMIT')
   expect((await a.query('SELECT revoked_at IS NOT NULL AS revoked FROM public.realtime_sessions WHERE jti=$1',[sessionId])).rows[0].revoked).toBe(true)
  }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');await a.query('RESET ROLE');await a.query('DELETE FROM public.profiles WHERE id=$1',[id]);a.release();b.release()}
 })
})
afterAll(()=>pool.end())
