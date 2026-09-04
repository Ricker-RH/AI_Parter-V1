import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {afterAll,describe,expect,it} from 'vitest'
import {createHumanProfileTabsRepository} from '../src/human-profile-tabs.js'
const url=process.env.HUMAN_DM_TEST_DATABASE_URL
const pool=new Pool({connectionString:url})
;(url?describe:describe.skip)('HUMAN public tab boundaries',()=>{
 afterAll(()=>pool.end())
 it('pages real saved/liked public posts newest first and filters unpublished IPs from following',async()=>{
  const c=await pool.connect();try{
   await c.query('BEGIN');const owner=randomUUID(),ip=randomUUID(),identity=randomUUID(),hidden=randomUUID()
   await c.query("INSERT INTO profiles(id,auth_subject,account_kind,username,display_name) VALUES($1::uuid,$1::text,'human',$2,'Owner')",[owner,`tab_${owner.replaceAll('-','').slice(0,18)}`])
   for(const id of [ip,hidden]){
    await c.query("INSERT INTO profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'IP')",[id,`tab_${id.replaceAll('-','').slice(0,18)}`])
    await c.query("INSERT INTO ip_profiles(profile_id,source,operation_enabled) VALUES($1,'platform',true)",[id])
    await c.query('INSERT INTO follows(follower_profile_id,followed_profile_id) VALUES($1,$2)',[owner,id])
   }
   await c.query("INSERT INTO ip_identity_revisions(id,ip_profile_id,version,display_name) VALUES($1,$2,1,'Published IP')",[identity,ip])
   await c.query("UPDATE ip_profiles SET current_identity_revision_id=$1,public_state='published' WHERE profile_id=$2",[identity,ip])
   const posts=[randomUUID(),randomUUID(),randomUUID()]
   for(const [i,id]of posts.entries()){
    await c.query("INSERT INTO posts(id,author_profile_id,source,state,body,published_at) VALUES($1,$2,'worker','published','Public post',now())",[id,ip])
    for(const table of ['bookmarks','post_likes'])await c.query(`INSERT INTO ${table}(profile_id,post_id,created_at) VALUES($1,$2,'2026-09-01'::timestamptz+$3*interval '1 second')`,[owner,id,i])
   }
   await c.query("INSERT INTO human_social_preferences(profile_id,profile_visibility) VALUES($1,'public')",[owner])
   const repository=createHumanProfileTabsRepository({withActor:async(_actor,fn)=>fn(c),withPublic:async fn=>{await c.query('SET LOCAL ROLE aifans_anon');return fn(c)}})
   for(const tab of ['liked','saved']as const){
    const first=await repository.getTab({viewer:null,profileId:owner,tab,limit:2});expect(first).toMatchObject({state:'ready',tab,items:[{id:posts[2]},{id:posts[1]}]})
    if(first?.state!=='ready'||!first.nextCursor)throw new Error('Expected cursor')
    const second=await repository.getTab({viewer:null,profileId:owner,tab,limit:2,cursor:first.nextCursor});expect(second).toMatchObject({items:[{id:posts[0]}],nextCursor:null})
    await expect(repository.getTab({viewer:null,profileId:owner,tab:'ips',limit:2,cursor:first.nextCursor})).rejects.toMatchObject({code:'22023'})
   }
   const following=await repository.getTab({viewer:null,profileId:owner,tab:'following',limit:20});expect(following).toMatchObject({state:'ready',tab:'following',items:[{kind:'ip',id:ip}]});if(following?.state==='ready')expect(following.items).toHaveLength(1)
   await c.query('RESET ROLE')
   const draft=randomUUID(),revision=randomUUID(),creatorIp=randomUUID(),creatorIdentity=randomUUID()
   await c.query(`INSERT INTO creator_drafts(id,creator_profile_id,state,username,display_name,short_description,language_codes,content_themes,personality,background,world,values_text,tone,interests,boundaries,relationship_style,visual_type,appearance)
    VALUES($1,$2,'submitted',$3,'Published creator IP','public bio',ARRAY['en'],ARRAY['art'],'secret personality','secret background','world','values','tone',ARRAY['art'],'boundaries','relationship','anime','appearance')`,[draft,owner,`cip_${creatorIp.replaceAll('-','').slice(0,16)}`])
   await c.query(`INSERT INTO creator_revisions(id,draft_id,creator_profile_id,version,username,display_name,short_description,language_codes,content_themes,personality,background,world,values_text,tone,interests,boundaries,relationship_style,visual_type,appearance)
    SELECT $1,id,creator_profile_id,1,username,display_name,short_description,language_codes,content_themes,personality,background,world,values_text,tone,interests,boundaries,relationship_style,visual_type,appearance FROM creator_drafts WHERE id=$2`,[revision,draft])
   await c.query("INSERT INTO profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'Published creator IP')",[creatorIp,`cip_${creatorIp.replaceAll('-','').slice(0,16)}`])
   await c.query("INSERT INTO ip_profiles(profile_id,source,creator_profile_id) VALUES($1,'creator',$2)",[creatorIp,owner])
   expect(await repository.getTab({viewer:null,profileId:owner,tab:'ips',limit:20})).toEqual({state:'ready',tab:'ips',items:[],nextCursor:null})
   await c.query('RESET ROLE')
   await c.query("INSERT INTO ip_identity_revisions(id,ip_profile_id,version,display_name,languages) VALUES($1,$2,1,'Published creator IP',ARRAY['en'])",[creatorIdentity,creatorIp])
   await c.query('INSERT INTO creator_ip_revisions(ip_profile_id,revision_id,creator_profile_id) VALUES($1,$2,$3)',[creatorIp,revision,owner])
   await c.query("UPDATE ip_profiles SET current_identity_revision_id=$1,active_creator_revision_id=$2,public_state='published' WHERE profile_id=$3",[creatorIdentity,revision,creatorIp])
   const ips=await repository.getTab({viewer:null,profileId:owner,tab:'ips',limit:20})
   expect(ips).toMatchObject({state:'ready',tab:'ips',items:[{id:creatorIp,visualType:'anime',creator:{id:owner}}]})
   expect(JSON.stringify(ips)).not.toMatch(/secret|appearance|personality|revision|draft|object_key|auth_subject/)
   expect(await repository.getTab({viewer:null,profileId:randomUUID(),tab:'ips',limit:20})).toBeNull()
  }finally{await c.query('ROLLBACK');c.release()}
 })
 it('locks all private tabs without rows or cursors, permits owner, honors both block directions',async()=>{
  const c=await pool.connect();try{
   await c.query('BEGIN');const a=randomUUID(),b=randomUUID()
   for(const id of [a,b])await c.query("INSERT INTO profiles(id,auth_subject,account_kind,username,display_name) VALUES($1::uuid,$1::text,'human',$2,'Human')",[id,`tab_${id.replaceAll('-','').slice(0,18)}`])
   const as=async(id:string)=>{await c.query('SET LOCAL ROLE aifans_authenticated');await c.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id})])}
   const read=async(tab:string)=>(await c.query('SELECT * FROM public.human_public_tab($1,$2,NULL,NULL,2)',[a,tab])).rows
   await c.query('SET LOCAL ROLE aifans_anon')
   for(const tab of ['ips','liked','saved','following'])expect(await read(tab)).toEqual([{state:'locked',item:null,sort_at:null,item_id:null}])
   await as(a);expect(await read('following')).toEqual([{state:'ready',item:null,sort_at:null,item_id:null}])
   await c.query("SELECT public.human_set_preferences('public',NULL)")
   await c.query('SELECT public.human_follow_profile($1)',[b])
   await c.query('SET LOCAL ROLE aifans_anon');expect((await read('following'))[0]).toMatchObject({state:'ready',item:{id:b,kind:'human'}})
   await as(b);await c.query('SELECT public.human_block_profile($1)',[a]);expect(await read('following')).toEqual([{state:'locked',item:null,sort_at:null,item_id:null}])
   await as(a);expect((await c.query('SELECT * FROM public.human_public_tab($1,$2,NULL,NULL,2)',[b,'following'])).rows).toEqual([{state:'locked',item:null,sort_at:null,item_id:null}])
  }finally{await c.query('ROLLBACK');c.release()}
 })
})
