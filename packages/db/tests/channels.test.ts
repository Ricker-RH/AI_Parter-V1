import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {Pool,type PoolClient} from 'pg'
import {afterAll,describe,expect,it,vi} from 'vitest'
import type {QueryClient} from '../src/session.js'
import {createChannelRepository,createPlatformChannelRepository} from '../src/channels.js'
import {createPlatformSession} from '../src/session.js'

const channelId='11111111-1111-4111-8111-111111111111'
const ipId='22222222-2222-4222-8222-222222222222'
const row={id:channelId,slug:'ai-news',name:'AI News',description:'News',image_object_key:null,ip_count:1,sort_order:2,search_rank:0.7}

describe('channel database slice',()=>{
  it('migration defines normalized constraints, trigram search, primary uniqueness and stable indexes',()=>{
    const sql=readFileSync(new URL('../migrations/202609040001_channels.sql',import.meta.url),'utf8')
    expect(sql).toContain('CREATE TABLE public.channel_search_aliases')
    expect(sql).toContain('CREATE TABLE public.channel_ip_profiles')
    expect(sql).toContain('channel_ip_profiles_one_primary_per_ip_idx')
    expect(sql).toContain('WHERE is_primary')
    expect(sql).toContain('gin_trgm_ops')
    expect(sql).toContain('curation_weight DESC')
    expect(sql).toContain('published_at DESC')
  })

  it('lists only projected public channels with bounded tuple pagination',async()=>{
    const query=vi.fn(async()=>({rows:[row],rowCount:1}))
    const client={query:query as QueryClient['query'],release:vi.fn()}
    const repository=createChannelRepository({withPublic:callback=>callback(client),publicMediaBaseUrl:'https://media.example/'})
    const page=await repository.listChannels({q:'人工智能',limit:20})
    expect(query.mock.calls[0]?.[0]).toContain('channel_public_list')
    expect(query.mock.calls[0]?.[1]).toEqual(['人工智能',null,null,null,21])
    expect(page).toEqual({items:[{id:channelId,slug:'ai-news',name:'AI News',description:'News',imageUrl:null,ipCount:1}],nextCursor:null})
  })

  it('does not force a recommendation lookup when detail is requested with limit zero',async()=>{
    const query=vi.fn(async()=>({rows:[row],rowCount:1}))
    const client={query:query as QueryClient['query'],release:vi.fn()}
    const repository=createChannelRepository({withPublic:callback=>callback(client)})
    await expect(repository.getChannel('ai-news',0)).resolves.toMatchObject({id:channelId,recommendedIps:[]})
    expect(query).toHaveBeenCalledOnce()
  })

  it('hydrates channel posts with the existing safe public media projection',async()=>{
    const postId='33333333-3333-4333-8333-333333333333'
    const post={channel_id:channelId,post_id:postId,body:'Media post',language_code:null,published_at:'2026-09-04T00:00:00Z',id:ipId,username:'sample_ip',display_name:'Sample',bio:null,languages:['en'],visual_type:'hybrid' as const,creator_id:null,creator_username:null,creator_display_name:null,like_count:0,comment_count:0,bookmark_count:0,share_count:0}
    const query=vi.fn().mockResolvedValueOnce({rows:[post],rowCount:1}).mockResolvedValueOnce({rows:[{id:channelId,object_key:`public/posts/${channelId}.webp`,alt_text:'alt',content_type:'image/webp',width:800,height:600}],rowCount:1})
    const client={query:query as QueryClient['query'],release:vi.fn()}
    const repository=createChannelRepository({withPublic:callback=>callback(client),publicMediaBaseUrl:'https://media.example/assets/'})
    const page=await repository.listPosts('ai-news',{limit:10})
    expect(query.mock.calls[1]?.[0]).toContain('social_public_post_media')
    expect(page.items[0]?.media?.[0]).toMatchObject({url:`https://media.example/assets/public/posts/${channelId}.webp`,altText:'alt',width:800,height:600})
  })

  it('orders IPs by curation, feed, latest publication and profile id',async()=>{
    const query=vi.fn(async()=>({rows:[{id:ipId,username:'sample_ip',display_name:'Sample',bio:null,languages:['zh-CN'],visual_type:'hybrid',creator_id:null,creator_username:null,creator_display_name:null,curation_weight:9,feed_weight:4,latest_published_at:null}],rowCount:1}))
    const client={query:query as QueryClient['query'],release:vi.fn()}
    const repository=createChannelRepository({withPublic:callback=>callback(client)})
    const page=await repository.listProfiles('ai-news',{limit:10})
    expect(query.mock.calls[0]?.[0]).toContain('channel_public_profiles')
    expect(query.mock.calls[0]?.[0]).toContain('curation_weight DESC, feed_weight DESC, latest_published_at DESC NULLS LAST, id DESC')
    expect(page.items.map(item=>item.id)).toEqual([ipId])
  })

  it('runs operator mutations through the platform transaction with request ids',async()=>{
    const query=vi.fn(async()=>({rows:[{...row,status:'draft',aliases:[],created_at:'2026-09-04T00:00:00Z',updated_at:'2026-09-04T00:00:00Z'}],rowCount:1}))
    const client={query:query as QueryClient['query'],release:vi.fn()}
    const repository=createPlatformChannelRepository({withPlatformActor:(_actor,callback)=>callback(client)})
    await repository.createChannel({actor:{subject:'operator'},requestId:channelId,channel:{slug:'ai-news',name:'AI News',description:'',sortOrder:0}})
    expect(query.mock.calls[0]?.[0]).toContain('platform_create_channel')
    expect(query.mock.calls[0]?.[1]?.at(-1)).toBe(channelId)
  })

  it('returns persisted aliases and member counts after an update',async()=>{
    const persisted={...row,status:'published',ip_count:3,aliases:['AI','人工智能'],created_at:'2026-09-04T00:00:00Z',updated_at:'2026-09-04T01:00:00Z'}
    const query=vi.fn().mockResolvedValueOnce({rows:[],rowCount:1}).mockResolvedValueOnce({rows:[persisted],rowCount:1})
    const client={query:query as QueryClient['query'],release:vi.fn()}
    const repository=createPlatformChannelRepository({withPlatformActor:(_actor,callback)=>callback(client)})
    const result=await repository.updateChannel({actor:{subject:'operator'},requestId:channelId,channelId,channel:{name:'AI Daily'}})
    expect(query.mock.calls[1]?.[0]).toContain('platform_channel_record')
    expect(result).toMatchObject({ipCount:3,aliases:['AI','人工智能']})
  })

  it('lists every channel status for operators with stable sort metadata',async()=>{
    const persisted={...row,status:'archived',ip_count:2,aliases:['AI'],created_at:'2026-09-04T00:00:00Z',updated_at:'2026-09-04T01:00:00Z'}
    const query=vi.fn(async()=>({rows:[persisted],rowCount:1}))
    const client={query:query as QueryClient['query'],release:vi.fn()}
    const repository=createPlatformChannelRepository({withPlatformActor:(_actor,callback)=>callback(client)})
    const page=await repository.listChannels({actor:{subject:'operator'},query:{q:'AI',status:'archived',limit:25}})
    expect(query.mock.calls[0]?.[0]).toContain('platform_list_channels')
    expect(query.mock.calls[0]?.[1]).toEqual(['AI','archived',null,null,null,26])
    expect(page.items[0]).toMatchObject({status:'archived',ipCount:2,aliases:['AI']})
  })

  it('gets one operator channel record directly by id',async()=>{
    const persisted={...row,status:'archived',ip_count:2,aliases:['AI'],created_at:'2026-09-04T00:00:00Z',updated_at:'2026-09-04T01:00:00Z'}
    const query=vi.fn(async()=>({rows:[persisted],rowCount:1}))
    const client={query:query as QueryClient['query'],release:vi.fn()}
    const repository=createPlatformChannelRepository({withPlatformActor:(_actor,callback)=>callback(client)})
    await expect(repository.getChannel({actor:{subject:'operator'},channelId})).resolves.toMatchObject({id:channelId,status:'archived',ipCount:2,aliases:['AI']})
    expect(query).toHaveBeenCalledWith('SELECT * FROM public.platform_channel_record($1)',[channelId])
  })

  it('returns null when an operator channel id does not exist',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:0}))
    const client={query:query as QueryClient['query'],release:vi.fn()}
    const repository=createPlatformChannelRepository({withPlatformActor:(_actor,callback)=>callback(client)})
    await expect(repository.getChannel({actor:{subject:'operator'},channelId})).resolves.toBeNull()
  })
})

const connectionString=process.env.DATABASE_URL??''
const describeIntegration=connectionString?describe:describe.skip
const pool=new Pool({connectionString})
afterAll(async()=>{await pool.end()})

async function fixtureIp(client:PoolClient,state:'published'|'draft'='published'){
  const id=randomUUID(),revision=randomUUID(),username=`ip_${id.replaceAll('-','').slice(0,20)}`
  await client.query("INSERT INTO public.profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'Channel IP')",[id,username])
  await client.query("INSERT INTO public.ip_profiles(profile_id,source,public_state,operation_enabled) VALUES($1,'platform',$2,true)",[id,state])
  await client.query("INSERT INTO public.ip_identity_revisions(id,ip_profile_id,version,display_name,languages) VALUES($1,$2,1,'Channel IP',ARRAY['en'])",[revision,id])
  await client.query('UPDATE public.ip_profiles SET current_identity_revision_id=$2 WHERE profile_id=$1',[id,revision])
  return id
}
async function fixtureOperator(client:PoolClient){const id=randomUUID(),subject=`operator-${randomUUID()}`;await client.query("INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'Operator')",[id,subject,`op_${id.replaceAll('-','').slice(0,20)}`]);await client.query("INSERT INTO public.profile_roles(profile_id,role,granted_by_profile_id) VALUES($1,'operator',$1)",[id]);return {id,subject}}
function platformRepo(client:PoolClient){const session=createPlatformSession({connect:async()=>({query:client.query.bind(client),release(){}})},{transactionMode:'nested'});return createPlatformChannelRepository({withPlatformActor:session.withPlatformActor,publicMediaBaseUrl:'https://media.example/assets/'})}
function publicRepo(client:PoolClient){return createChannelRepository({publicMediaBaseUrl:'https://media.example/assets/',withPublic:async callback=>{await client.query('SAVEPOINT channel_anon');try{await client.query('SET LOCAL ROLE aifans_anon');const value=await callback({query:client.query.bind(client),release(){}});await client.query('SET LOCAL ROLE NONE');await client.query('RELEASE SAVEPOINT channel_anon');return value}catch(error){await client.query('ROLLBACK TO SAVEPOINT channel_anon');await client.query('RELEASE SAVEPOINT channel_anon');throw error}}})}

describeIntegration('channel migration, RLS and repository integration',()=>{
  it('enforces roles, multi-membership and one primary while hiding archived channels',async()=>{const client=await pool.connect();try{await client.query('BEGIN');const operator=await fixtureOperator(client),ip=await fixtureIp(client);const platform=platformRepo(client);const one=await platform.createChannel({actor:{subject:operator.subject},requestId:randomUUID(),channel:{slug:`one-${randomUUID().slice(0,8)}`,name:'One',description:'',sortOrder:1}});const two=await platform.createChannel({actor:{subject:operator.subject},requestId:randomUUID(),channel:{slug:`two-${randomUUID().slice(0,8)}`,name:'Two',description:'',sortOrder:2}});await platform.setMembership({actor:{subject:operator.subject},requestId:randomUUID(),channelId:one.id,membership:{ipProfileId:ip,isPrimary:true,curationWeight:2}});await platform.setMembership({actor:{subject:operator.subject},requestId:randomUUID(),channelId:two.id,membership:{ipProfileId:ip,isPrimary:true,curationWeight:3}});expect((await client.query<{count:number}>('SELECT count(*)::int count FROM public.channel_ip_profiles WHERE ip_profile_id=$1',[ip])).rows[0]?.count).toBe(2);expect((await client.query<{channel_id:string}>('SELECT channel_id FROM public.channel_ip_profiles WHERE ip_profile_id=$1 AND is_primary',[ip])).rows).toEqual([{channel_id:two.id}]);await platform.setStatus({actor:{subject:operator.subject},requestId:randomUUID(),channelId:one.id,status:'published'});expect((await publicRepo(client).listChannels({limit:20})).items.map(item=>item.id)).toContain(one.id);await platform.setStatus({actor:{subject:operator.subject},requestId:randomUUID(),channelId:one.id,status:'archived'});expect(await publicRepo(client).getChannel(one.slug)).toBeNull();await client.query('SAVEPOINT direct_anon');await client.query('SET LOCAL ROLE aifans_anon');await expect(client.query('SELECT * FROM public.channels')).rejects.toMatchObject({code:'42501'});await client.query('ROLLBACK TO SAVEPOINT direct_anon');await client.query('RELEASE SAVEPOINT direct_anon')}finally{await client.query('ROLLBACK').catch(()=>undefined);client.release()}})

  it('returns media and stable post cursors without duplicates',async()=>{const client=await pool.connect();try{await client.query('BEGIN');const operator=await fixtureOperator(client),ip=await fixtureIp(client);const platform=platformRepo(client);const channel=await platform.createChannel({actor:{subject:operator.subject},requestId:randomUUID(),channel:{slug:`feed-${randomUUID().slice(0,8)}`,name:'Feed',description:'',sortOrder:0}});await platform.setMembership({actor:{subject:operator.subject},requestId:randomUUID(),channelId:channel.id,membership:{ipProfileId:ip,isPrimary:false,curationWeight:0}});await platform.setStatus({actor:{subject:operator.subject},requestId:randomUUID(),channelId:channel.id,status:'published'});const at='2026-09-04T00:00:00Z',ids=[randomUUID(),randomUUID()];for(const id of ids)await client.query("INSERT INTO public.posts(id,author_profile_id,state,source,body,published_at) VALUES($1,$2,'published','worker',$3,$4)",[id,ip,id,at]);const mediaId=randomUUID();await client.query("INSERT INTO public.post_media(id,post_id,position,object_key,alt_text,content_type,width,height) VALUES($1,$2,1,$3,'safe','image/webp',800,600)",[mediaId,ids[0],`public/posts/${mediaId}.webp`]);const repository=publicRepo(client),first=await repository.listPosts(channel.slug,{limit:1});const second=await repository.listPosts(channel.slug,{limit:1,cursor:first.nextCursor!});expect(first.items).toHaveLength(1);expect(second.items).toHaveLength(1);expect(new Set([...first.items,...second.items].map(item=>item.id)).size).toBe(2);expect([...first.items,...second.items].flatMap(item=>item.media??[])[0]?.url).toMatch(/^https:\/\/media\.example\/assets\/public\/posts\//)}finally{await client.query('ROLLBACK').catch(()=>undefined);client.release()}})

  it('paginates admin channels with different microseconds in one millisecond exactly once',async()=>{const client=await pool.connect();try{await client.query('BEGIN');const operator=await fixtureOperator(client),platform=platformRepo(client);const channels=await Promise.all(['A','B'].map(name=>platform.createChannel({actor:{subject:operator.subject},requestId:randomUUID(),channel:{slug:`admin-cursor-${name.toLowerCase()}-${randomUUID().slice(0,8)}`,name,description:'',sortOrder:7}})));await client.query("UPDATE public.channels SET updated_at=CASE id WHEN $1 THEN '2026-09-04T00:00:00.000900Z'::timestamptz ELSE '2026-09-04T00:00:00.000800Z'::timestamptz END WHERE id=ANY($2::uuid[])",[channels[0]!.id,channels.map(channel=>channel.id)]);const first=await platform.listChannels({actor:{subject:operator.subject},query:{limit:1}}),second=await platform.listChannels({actor:{subject:operator.subject},query:{limit:1,cursor:first.nextCursor!}});expect(first.nextCursor).not.toBeNull();expect([...first.items,...second.items].map(item=>item.id).sort()).toEqual(channels.map(channel=>channel.id).sort())}finally{await client.query('ROLLBACK').catch(()=>undefined);client.release()}})

  it('paginates channel IPs with different latest-post microseconds in one millisecond exactly once',async()=>{const client=await pool.connect();try{await client.query('BEGIN');const operator=await fixtureOperator(client),platform=platformRepo(client),ips=await Promise.all([fixtureIp(client),fixtureIp(client)]),channel=await platform.createChannel({actor:{subject:operator.subject},requestId:randomUUID(),channel:{slug:`ip-cursor-${randomUUID().slice(0,8)}`,name:'IP cursor',description:'',sortOrder:0}});for(const ip of ips)await platform.setMembership({actor:{subject:operator.subject},requestId:randomUUID(),channelId:channel.id,membership:{ipProfileId:ip,isPrimary:false,curationWeight:3}});await platform.setStatus({actor:{subject:operator.subject},requestId:randomUUID(),channelId:channel.id,status:'published'});for(const [index,ip] of ips.entries())await client.query("INSERT INTO public.posts(id,author_profile_id,state,source,body,published_at) VALUES($1,$2,'published','worker',$3,$4)",[randomUUID(),ip,`post-${index}`,index===0?'2026-09-04T00:00:00.000900Z':'2026-09-04T00:00:00.000800Z']);const repository=publicRepo(client),first=await repository.listProfiles(channel.slug,{limit:1}),second=await repository.listProfiles(channel.slug,{limit:1,cursor:first.nextCursor!});expect(first.nextCursor).not.toBeNull();expect([...first.items,...second.items].map(item=>item.id).sort()).toEqual([...ips].sort())}finally{await client.query('ROLLBACK').catch(()=>undefined);client.release()}})

  it('paginates channel posts with different microseconds in one millisecond exactly once',async()=>{const client=await pool.connect();try{await client.query('BEGIN');const operator=await fixtureOperator(client),ip=await fixtureIp(client),platform=platformRepo(client),channel=await platform.createChannel({actor:{subject:operator.subject},requestId:randomUUID(),channel:{slug:`post-cursor-${randomUUID().slice(0,8)}`,name:'Post cursor',description:'',sortOrder:0}});await platform.setMembership({actor:{subject:operator.subject},requestId:randomUUID(),channelId:channel.id,membership:{ipProfileId:ip,isPrimary:false,curationWeight:0}});await platform.setStatus({actor:{subject:operator.subject},requestId:randomUUID(),channelId:channel.id,status:'published'});const ids=[randomUUID(),randomUUID()];for(const [index,id] of ids.entries())await client.query("INSERT INTO public.posts(id,author_profile_id,state,source,body,published_at) VALUES($1,$2,'published','worker',$3,$4)",[id,ip,`post-${index}`,index===0?'2026-09-04T00:00:00.000900Z':'2026-09-04T00:00:00.000800Z']);const repository=publicRepo(client),first=await repository.listPosts(channel.slug,{limit:1}),second=await repository.listPosts(channel.slug,{limit:1,cursor:first.nextCursor!});expect(first.nextCursor).not.toBeNull();expect([...first.items,...second.items].map(item=>item.id).sort()).toEqual([...ids].sort())}finally{await client.query('ROLLBACK').catch(()=>undefined);client.release()}})

  it('rejects missing mutations without a succeeded audit event',async()=>{const client=await pool.connect();try{await client.query('BEGIN');const operator=await fixtureOperator(client),platform=platformRepo(client),missing=randomUUID(),requestId=randomUUID();await expect(platform.setStatus({actor:{subject:operator.subject},requestId,channelId:missing,status:'published'})).rejects.toMatchObject({code:'P0002'});expect((await client.query<{count:number}>('SELECT count(*)::int count FROM public.audit_events WHERE request_id=$1',[requestId])).rows[0]?.count).toBe(0)}finally{await client.query('ROLLBACK').catch(()=>undefined);client.release()}})
})
