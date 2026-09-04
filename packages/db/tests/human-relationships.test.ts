import {expect,it,vi} from 'vitest'
import {createHumanSocialRepository} from '../src/human-social.js'
import type {WithActor} from '../src/session.js'
import {Pool} from 'pg'
import {randomUUID} from 'node:crypto'
const id='11111111-1111-4111-8111-111111111111'
it('reads bounded unique relationship identities in one authorized statement',async()=>{
 const query=vi.fn(async()=>({rows:[{profile_id:id,is_owner:false,following:false,followed_by:true,blocked:true}],rowCount:1}))
 const withActor:WithActor=async(_actor,run)=>run({query,release(){}})
 const repo=createHumanSocialRepository({withActor,withPublic:async()=>{throw Error('must authenticate')}})
 expect(await repo.getRelationships({subject:'viewer'},[id])).toEqual({items:[{profileId:id,isOwner:false,following:false,followedBy:true,blocked:true}]})
 expect(query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('human_public_profile'),[[id]])
 await expect(repo.getRelationships({subject:'viewer'},[id,id])).rejects.toThrow()
 await expect(repo.getRelationships({subject:'viewer'},Array(51).fill(id))).rejects.toThrow()
});
it.skipIf(!process.env.HUMAN_DM_TEST_DATABASE_URL)('projects self and current blocked relationships without private data',async()=>{
 const pool=new Pool({connectionString:process.env.HUMAN_DM_TEST_DATABASE_URL}),c=await pool.connect(),a=randomUUID(),b=randomUUID()
 try{
  await c.query('BEGIN')
  for(const id of [a,b])await c.query("INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1::uuid,$1::text,'human',$2,'relationship')",[id,`b_${id.replaceAll('-','').slice(0,20)}`])
  await c.query('SET LOCAL ROLE aifans_authenticated');await c.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a})])
  const repo=createHumanSocialRepository({withActor:async(_actor,run)=>run(c),withPublic:async()=>{throw Error()}})
  const result=await repo.getRelationships({subject:a},[a,b]);expect(result.items.find(item=>item.profileId===a)?.isOwner).toBe(true)
  expect(result.items.find(item=>item.profileId===b)?.blocked).toBe(false)
  await c.query('SELECT public.human_block_profile($1)',[b])
  expect((await repo.getRelationships({subject:a},[b])).items[0]?.blocked).toBe(true)
 }finally{await c.query('ROLLBACK');c.release();await pool.end()}
});
