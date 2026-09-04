import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {afterAll,describe,it,expect} from 'vitest'
const url=process.env.HUMAN_DM_TEST_DATABASE_URL
const pool=new Pool({connectionString:url})
;(url?describe:describe.skip)('blocked HUMAN notification projection',()=>{
  afterAll(()=>pool.end())
  it('hides both directions of blocked actors before paging',async()=>{
    const client=await pool.connect()
    try {
      await client.query('BEGIN')
      const a=randomUUID(),b=randomUUID(),c=randomUUID()
      for(const id of [a,b,c]) await client.query("INSERT INTO profiles(id,auth_subject,account_kind,username,display_name) VALUES($1::uuid,$1::text,'human',$2,'Human')",[id,`notify_${id.replaceAll('-','').slice(0,16)}`])
      for(const actor of [b,c]) await client.query("INSERT INTO notifications(id,recipient_profile_id,actor_profile_id,kind) VALUES($1,$2,$3,'follow')",[randomUUID(),a,actor])
      await client.query('INSERT INTO human_blocks(blocker_profile_id,blocked_profile_id) VALUES($1,$2)',[b,a])
      await client.query('SET LOCAL ROLE aifans_authenticated')
      await client.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a})])
      const rows=(await client.query('SELECT actor_id FROM social_my_notifications(NULL,20)')).rows
      expect(rows).toEqual([{actor_id:c}])
      await client.query('RESET ROLE')
      await client.query('DELETE FROM human_blocks WHERE blocker_profile_id=$1 AND blocked_profile_id=$2',[b,a])
      await client.query('INSERT INTO human_blocks(blocker_profile_id,blocked_profile_id) VALUES($1,$2)',[a,b])
      await client.query('SET LOCAL ROLE aifans_authenticated')
      expect((await client.query('SELECT actor_id FROM social_my_notifications(NULL,1)')).rows).toEqual([{actor_id:c}])
    } finally {await client.query('ROLLBACK');client.release()}
  })
})
