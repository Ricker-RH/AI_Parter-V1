import {randomUUID} from 'node:crypto'
import {Pool, type PoolClient} from 'pg'
import {afterAll, afterEach, describe, expect, it} from 'vitest'
import {decodeCursor, decodeFollowedIpCursor, decodeLikedCursor, decodeSavedCursor, encodeCursor, encodeNotificationCursor, PublicIpSchema} from '@aifans/contracts'
import {createSocialRepository} from '../src/social.js'
import {createActorSession, createPlatformSession} from '../src/session.js'

const connectionString=process.env.DATABASE_URL ?? ''
const integration=connectionString ? describe : describe.skip
const pool=new Pool({connectionString})
async function tx<T>(fn:(c:PoolClient)=>Promise<T>) { const c=await pool.connect(); try { await c.query('BEGIN'); return await fn(c) } finally { await c.query('ROLLBACK').catch(()=>undefined); c.release() } }
async function human(c:PoolClient) { const id=randomUUID(), subject=`fixture-${randomUUID()}`; await c.query(`INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'Human')`,[id,subject,`h_${id.replaceAll('-','').slice(0,20)}`]); return {id,subject} }
async function ip(c:PoolClient, state:'published'|'draft'='published') { const id=randomUUID(), revision=randomUUID(); await c.query(`INSERT INTO public.profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'IP')`,[id,`i_${id.replaceAll('-','').slice(0,20)}`]); await c.query(`INSERT INTO public.ip_profiles(profile_id,source,public_state,operation_enabled,current_identity_revision_id) VALUES($1,'platform',$2,true,$3)`,[id,state,revision]); await c.query(`INSERT INTO public.ip_identity_revisions(id,ip_profile_id,version,display_name,languages) VALUES($1,$2,1,'IP',ARRAY['en'])`,[revision,id]); return id }
async function post(c:PoolClient, author:string, state:'published'|'draft'|'withdrawn'='published', publishedAt?:string, languageCode?:'en'|'zh-CN') { const id=randomUUID(); const timestamp=publishedAt??new Date().toISOString(); if(state==='draft') await c.query(`INSERT INTO public.posts(id,author_profile_id,source,state,body,language_code) VALUES($1,$2,'worker',$3,'fixture',$4)`,[id,author,state,languageCode??null]); else if(state==='published') await c.query(`INSERT INTO public.posts(id,author_profile_id,source,state,body,published_at,language_code) VALUES($1,$2,'worker',$3,'fixture',$4::timestamptz,$5)`,[id,author,state,timestamp,languageCode??null]); else await c.query(`INSERT INTO public.posts(id,author_profile_id,source,state,body,published_at,withdrawn_at,language_code) VALUES($1,$2,'worker',$3,'fixture',$4::timestamptz,$4::timestamptz,$5)`,[id,author,state,timestamp,languageCode??null]); return id }
function notificationCursor(createdAt:string,id:string) { return encodeNotificationCursor({v:1,kind:'notifications',createdAt,id}) }
function context() { return {requestId: randomUUID()} }
function repo(c:PoolClient) {
 const session=createActorSession({connect:async()=>({query:c.query.bind(c),release(){}})}, {transactionMode:'nested'})
 return createSocialRepository({
  withActor:session.withActor,
  withPublic:async(fn)=>{
   await c.query('SAVEPOINT anon')
   try {
    await c.query('SET LOCAL ROLE aifans_anon')
    await c.query("SELECT set_config('request.jwt.claims','{}',true)")
    const value=await fn({query:c.query.bind(c),release(){}})
    await c.query('SET LOCAL ROLE NONE')
    await c.query('RELEASE SAVEPOINT anon')
    return value
   } catch(error) {
    await c.query('ROLLBACK TO SAVEPOINT anon').catch(()=>undefined)
    await c.query('RELEASE SAVEPOINT anon').catch(()=>undefined)
    throw error
   }
  },
 })
}

async function committedCommentFixture() {
 const client=await pool.connect()
 try {
  await client.query('BEGIN')
  const author=await ip(client),actor=await human(client),postId=await post(client,author)
  await client.query('COMMIT')
  return {actor,author,postId}
 } catch(error) { await client.query('ROLLBACK').catch(()=>undefined); throw error } finally { client.release() }
}

async function expectVisibilityChangeToWin(change:(client:PoolClient,fixture:Awaited<ReturnType<typeof committedCommentFixture>>)=>Promise<void>) {
 const fixture=await committedCommentFixture(),stateClient=await pool.connect(),commentClient=await pool.connect()
 try {
  await stateClient.query('BEGIN')
  await change(stateClient,fixture)
  await commentClient.query('BEGIN')
  const commentPid=(await commentClient.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
  const attempt=repo(commentClient).createHumanComment(fixture.actor,fixture.postId,{body:'racing comment'},context()).then(()=>({ok:true as const})).catch((error:unknown)=>({ok:false as const,error}))
  let blocked=false
  for(let poll=0;poll<50;poll+=1) {
   const activity=await stateClient.query<{wait_event_type:string|null}>('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[commentPid])
   if(activity.rows[0]?.wait_event_type==='Lock') { blocked=true;break }
   const settled=await Promise.race([attempt.then(()=>true),new Promise<false>((resolve)=>setTimeout(()=>resolve(false),10))])
   if(settled) break
  }
  await stateClient.query('COMMIT')
  const outcome=await attempt
  expect(blocked).toBe(true)
  expect(outcome.ok).toBe(false)
  if(!outcome.ok) expect(outcome.error).toMatchObject({code:'P0002'})
  await expect(stateClient.query("SELECT 1 FROM public.comments WHERE post_id=$1 AND body='racing comment'",[fixture.postId])).resolves.toMatchObject({rowCount:0})
 } finally {
  await Promise.all([stateClient.query('ROLLBACK').catch(()=>undefined),commentClient.query('ROLLBACK').catch(()=>undefined)])
  stateClient.release();commentClient.release()
 }
}

type CommittedShareFixture = {
 author:string
 represented:string
 actor:Awaited<ReturnType<typeof human>>
 operator:Awaited<ReturnType<typeof human>>
 postId:string
}
const committedShareFixtures=new Set<CommittedShareFixture>()

async function committedShareFixture():Promise<CommittedShareFixture> {
 const client=await pool.connect()
 try {
  await client.query('BEGIN')
  const author=await ip(client)
  const represented=await ip(client)
  const actor=await human(client)
  const operator=await human(client)
  await client.query("INSERT INTO public.profile_roles(profile_id,role,granted_by_profile_id) VALUES($1,'operator',$1)",[operator.id])
  const postId=await post(client,author)
  await client.query('COMMIT')
  const fixture={author,represented,actor,operator,postId}
  committedShareFixtures.add(fixture)
  return fixture
 } catch(error) {
  await client.query('ROLLBACK').catch(()=>undefined)
  throw error
 } finally {
  client.release()
 }
}

async function cleanupCommittedShareFixture(fixture:CommittedShareFixture) {
 if(!committedShareFixtures.has(fixture)) return
 const client=await pool.connect()
 try {
  await client.query('BEGIN')
  await client.query('SET CONSTRAINTS ALL DEFERRED')
  const comments=await client.query<{id:string}>('SELECT id FROM public.comments WHERE post_id=$1',[fixture.postId])
  const commentIds=comments.rows.map((row)=>row.id)
  if(commentIds.length) {
   await client.query('ALTER TABLE public.analytics_outbox DISABLE TRIGGER analytics_outbox_guard')
   await client.query('ALTER TABLE public.business_events DISABLE TRIGGER business_events_append_only')
   await client.query('ALTER TABLE public.audit_events DISABLE TRIGGER audit_events_append_only')
   await client.query('ALTER TABLE public.workflow_transitions DISABLE TRIGGER workflow_transitions_append_only')
   await client.query("DELETE FROM public.analytics_outbox WHERE business_event_id IN (SELECT id FROM public.business_events WHERE subject_entity_type='comment' AND subject_entity_id=ANY($1::uuid[]))",[commentIds])
   await client.query("DELETE FROM public.business_events WHERE subject_entity_type='comment' AND subject_entity_id=ANY($1::uuid[])",[commentIds])
   await client.query("DELETE FROM public.audit_events WHERE entity_type='comment' AND entity_id=ANY($1::uuid[])",[commentIds])
   await client.query("DELETE FROM public.workflow_transitions WHERE entity_type='comment' AND entity_id=ANY($1::uuid[])",[commentIds])
   await client.query('SET CONSTRAINTS ALL IMMEDIATE')
   await client.query('ALTER TABLE public.analytics_outbox ENABLE TRIGGER analytics_outbox_guard')
   await client.query('ALTER TABLE public.business_events ENABLE TRIGGER business_events_append_only')
   await client.query('ALTER TABLE public.audit_events ENABLE TRIGGER audit_events_append_only')
   await client.query('ALTER TABLE public.workflow_transitions ENABLE TRIGGER workflow_transitions_append_only')
   await client.query('DELETE FROM public.notifications WHERE comment_id=ANY($1::uuid[])',[commentIds])
   await client.query('DELETE FROM public.comment_likes WHERE comment_id=ANY($1::uuid[])',[commentIds])
   await client.query('ALTER TABLE public.comments DISABLE TRIGGER comments_reject_delete')
   await client.query('DELETE FROM public.comments WHERE id=ANY($1::uuid[])',[commentIds])
   await client.query('SET CONSTRAINTS ALL IMMEDIATE')
   await client.query('ALTER TABLE public.comments ENABLE TRIGGER comments_reject_delete')
  }
  await client.query('DELETE FROM public.notifications WHERE post_id=$1',[fixture.postId])
  const shareLedger=await client.query<{table_name:string|null}>("SELECT to_regclass('public.post_share_events')::text AS table_name")
  if(shareLedger.rows[0]?.table_name) await client.query('DELETE FROM public.post_share_events WHERE post_id=$1',[fixture.postId])
  await client.query('DELETE FROM public.post_likes WHERE post_id=$1',[fixture.postId])
  await client.query('DELETE FROM public.bookmarks WHERE post_id=$1',[fixture.postId])
  await client.query('ALTER TABLE public.posts DISABLE TRIGGER posts_reject_delete')
  await client.query('DELETE FROM public.posts WHERE id=$1',[fixture.postId])
  await client.query('SET CONSTRAINTS ALL IMMEDIATE')
  await client.query('ALTER TABLE public.posts ENABLE TRIGGER posts_reject_delete')
  await client.query('DELETE FROM public.profile_roles WHERE profile_id=$1',[fixture.operator.id])
  const ipIds=[fixture.author,fixture.represented]
  await client.query("UPDATE public.ip_profiles SET public_state='draft',operation_enabled=false,current_identity_revision_id=NULL WHERE profile_id=ANY($1::uuid[])",[ipIds])
  await client.query('ALTER TABLE public.ip_identity_revisions DISABLE TRIGGER ip_identity_revisions_immutable')
  await client.query('DELETE FROM public.ip_identity_revisions WHERE ip_profile_id=ANY($1::uuid[])',[ipIds])
  await client.query('SET CONSTRAINTS ALL IMMEDIATE')
  await client.query('ALTER TABLE public.ip_identity_revisions ENABLE TRIGGER ip_identity_revisions_immutable')
  await client.query('DELETE FROM public.ip_profiles WHERE profile_id=ANY($1::uuid[])',[ipIds])
  await client.query('DELETE FROM public.profiles WHERE id=ANY($1::uuid[])',[[...ipIds,fixture.actor.id,fixture.operator.id]])
  await client.query('COMMIT')
  committedShareFixtures.delete(fixture)
 } catch(error) {
  await client.query('ROLLBACK').catch(()=>undefined)
  throw error
 } finally {
  client.release()
 }
}

afterEach(async()=>{
 for(const fixture of [...committedShareFixtures]) await cleanupCommittedShareFixture(fixture)
})

async function bounded<T>(promise:Promise<T>,label:string,timeoutMs=5_000):Promise<T> {
 let timer:ReturnType<typeof setTimeout>|undefined
 try {
  return await Promise.race([
   promise,
   new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out`)),timeoutMs)}),
  ])
 } finally {
  if(timer) clearTimeout(timer)
 }
}

async function beginBounded(client:PoolClient) {
 await client.query('BEGIN')
 await client.query("SET LOCAL lock_timeout='2s'")
 await client.query("SET LOCAL statement_timeout='4s'")
}

async function rollbackAndRelease(client:PoolClient) {
 try {
  await bounded(client.query('ROLLBACK'),'rollback',5_000)
  client.release()
 } catch {
  client.release(true)
 }
}

async function expectSessionToWaitOnLock(observer:PoolClient,blockedPid:number,attempt:Promise<unknown>) {
 let blocked=false
 for(let poll=0;poll<50;poll+=1) {
  const activity=await observer.query<{wait_event_type:string|null}>('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[blockedPid])
  if(activity.rows[0]?.wait_event_type==='Lock') {
   blocked=true
   break
  }
  const settled=await Promise.race([attempt.then(()=>true),new Promise<false>((resolve)=>setTimeout(()=>resolve(false),10))])
  if(settled) break
 }
 expect(blocked).toBe(true)
}

type TaggedOutcome = {
 kind:'share'|'comment'
 outcome:{ok:true;value:unknown}|{ok:false;error:unknown}
}

async function expectShareCommentLockOrder(
 commentKind:'human'|'platform',
 shareActor:'anonymous'|'operator'='anonymous',
) {
 const fixture=await committedShareFixture()
 const blocker=await pool.connect()
 const shareClient=await pool.connect()
 const commentClient=await pool.connect()
 const activePids:number[]=[]
 let shareAttempt:Promise<{ok:true;value:unknown}|{ok:false;error:unknown}>|undefined
 let commentAttempt:Promise<{ok:true;value:unknown}|{ok:false;error:unknown}>|undefined
 try {
  const definitions=await blocker.query<{name:string;definition:string}>(`
   SELECT p.proname AS name,pg_get_functiondef(p.oid) AS definition
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.oid IN (
    'public.record_post_share(uuid,uuid)'::regprocedure,
    'public.create_human_comment(uuid,uuid,text,uuid)'::regprocedure,
    'public.platform_publish_ip_comment(uuid,uuid,text,uuid,uuid)'::regprocedure,
    'public.social_lock_comment_authors(uuid[])'::regprocedure
   )
  `)
  const byName=new Map(definitions.rows.map((row)=>[row.name,row.definition]))
  for(const name of ['record_post_share','create_human_comment','platform_publish_ip_comment','social_lock_comment_authors']) {
   expect(byName.has(name),`${name} is installed`).toBe(true)
  }
  expect(byName.get('record_post_share')).toMatch(/FROM public\.posts[\s\S]*FOR (?:SHARE|UPDATE)(?: OF \w+)?;[\s\S]*FROM public\.ip_profiles/)
  for(const name of ['create_human_comment','platform_publish_ip_comment']) {
   expect(byName.get(name)).toMatch(/FROM public\.posts[\s\S]*FOR UPDATE(?: OF \w+)?;[\s\S]*social_lock_comment_authors[\s\S]*FROM public\.comments comment[\s\S]*ORDER BY CASE[\s\S]*FOR UPDATE/)
  }
  expect(byName.get('social_lock_comment_authors')).toMatch(/FROM public\.ip_profiles ip[\s\S]*JOIN public\.ip_identity_revisions identity[\s\S]*ORDER BY ip\.profile_id[\s\S]*FOR UPDATE OF ip,\s*identity[\s\S]*JOIN public\.creator_revisions creator[\s\S]*ORDER BY ip\.profile_id[\s\S]*FOR UPDATE OF creator/)

  await beginBounded(blocker)
  await beginBounded(shareClient)
  await beginBounded(commentClient)
  const blockerPid=(await blocker.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
  const sharePid=(await shareClient.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
  const commentPid=(await commentClient.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
  activePids.push(blockerPid,sharePid,commentPid)
  await blocker.query('SELECT id FROM public.posts WHERE id=$1 FOR UPDATE',[fixture.postId])

  const shareKey=randomUUID()
  const body=`lock-order-${commentKind}-${randomUUID()}`
  const rawShareAttempt=repo(shareClient).recordPostShare(
   shareActor==='operator'?fixture.operator:null,
   fixture.postId,
   shareKey,
  )
  const rawCommentAttempt=commentKind==='human'
   ? repo(commentClient).createHumanComment(fixture.actor,fixture.postId,{body},context())
   : createPlatformSession({connect:async()=>({query:commentClient.query.bind(commentClient),release(){}})},{transactionMode:'nested'}).withPlatformActor(
    fixture.operator,
    async(client)=>(await client.query('SELECT * FROM public.platform_publish_ip_comment($1,$2,$3,$4,$5)',[fixture.postId,fixture.represented,body,null,randomUUID()])).rows[0],
   )
  shareAttempt=bounded(rawShareAttempt.then((value)=>({ok:true as const,value})).catch((error:unknown)=>({ok:false as const,error})),'share statement')
  commentAttempt=bounded(rawCommentAttempt.then((value)=>({ok:true as const,value})).catch((error:unknown)=>({ok:false as const,error})),'comment statement')
  const taggedShare=shareAttempt.then((outcome):TaggedOutcome=>({kind:'share',outcome}))
  const taggedComment=commentAttempt.then((outcome):TaggedOutcome=>({kind:'comment',outcome}))

  await expectSessionToWaitOnLock(blocker,sharePid,shareAttempt)
  await expectSessionToWaitOnLock(blocker,commentPid,commentAttempt)
  await bounded(blocker.query('COMMIT'),'blocker commit')

  const assertOwnTransactionRowCount=async(kind:'share'|'comment',count:number)=>{
   const result=kind==='share'
    ? await shareClient.query<{count:number}>('SELECT count(*)::int AS count FROM public.post_share_events WHERE post_id=$1 AND idempotency_key=$2',[fixture.postId,shareKey])
    : await commentClient.query<{count:number}>('SELECT count(*)::int AS count FROM public.comments WHERE post_id=$1 AND body=$2',[fixture.postId,body])
   expect(result.rows).toEqual([{count}])
  }
  const first=await bounded(Promise.race([taggedShare,taggedComment]),'first command settlement')
  if(!first.outcome.ok) expect(first.outcome.error).not.toMatchObject({code:'40P01'})
  expect(first.outcome.ok).toBe(true)
  await bounded(assertOwnTransactionRowCount(first.kind,1),'first row assertion')
  await bounded((first.kind==='share'?shareClient:commentClient).query('ROLLBACK'),'first command rollback')

  const second=await bounded(first.kind==='share'?taggedComment:taggedShare,'second command settlement')
  if(!second.outcome.ok) expect(second.outcome.error).not.toMatchObject({code:'40P01'})
  expect(second.outcome.ok).toBe(true)
  await bounded(assertOwnTransactionRowCount(second.kind,1),'second row assertion')
  await bounded((second.kind==='share'?shareClient:commentClient).query('ROLLBACK'),'second command rollback')
 } finally {
  if(activePids.length) {
   await bounded(pool.query('SELECT pg_cancel_backend(pid) FROM unnest($1::int[]) AS active(pid)',[activePids]),'backend cancellation').catch(()=>undefined)
  }
  await Promise.allSettled([
   ...(shareAttempt?[bounded(shareAttempt,'share cleanup')]:[]),
   ...(commentAttempt?[bounded(commentAttempt,'comment cleanup')]:[]),
  ])
  await Promise.all([rollbackAndRelease(blocker),rollbackAndRelease(shareClient),rollbackAndRelease(commentClient)])
  await cleanupCommittedShareFixture(fixture)
 }
}

integration('social repository local postgres',()=>{
 afterAll(async()=>pool.end())
 it('returns only published public posts and keeps viewer flags actor-scoped',async()=>tx(async c=>{
  const author=await ip(c); const hidden=await ip(c,'draft'); const visible=await post(c,author); await post(c,hidden); await post(c,author,'withdrawn');
  const first=await human(c), second=await human(c); const social=repo(c);
  const ownerProjection=await c.query('SELECT post_id FROM public.social_public_posts()'); expect(ownerProjection.rows.map((row)=>row.post_id)).toContain(visible);
  await c.query('SAVEPOINT diagnostic_anon'); await c.query('SET LOCAL ROLE aifans_anon'); const anonProjection=await c.query('SELECT post_id FROM public.social_public_posts()'); const flags=await c.query('SELECT * FROM public.social_viewer_flags($1,$2)',[visible,author]); const metrics=await c.query('SELECT * FROM public.social_post_metrics($1,$2,$3)',[visible,author,'en']); const identity=await c.query("SELECT current_user, current_setting('request.jwt.claims',true) AS claims"); await c.query('ROLLBACK TO SAVEPOINT diagnostic_anon'); await c.query('RELEASE SAVEPOINT diagnostic_anon'); expect(identity.rows[0]?.current_user).toBe('aifans_anon'); expect(anonProjection.rows.map((row)=>row.post_id)).toContain(visible); expect(flags.rows).toHaveLength(1); expect(metrics.rows).toHaveLength(1);
  await social.likePost(first,visible,context()); await social.bookmarkPost(first,visible); await social.bookmarkPost(second,visible); await social.recordPostShare(first,visible,randomUUID()); await social.recordPostShare(null,visible,randomUUID()); await social.follow(first,author,context());
  const anon=await social.listFeed({viewer:null,kind:'for_you',limit:25,after:null}); expect(anon.items.map(x=>x.id)).toEqual([visible]); expect(anon.items[0]).toMatchObject({likeCount:1,commentCount:0,bookmarkCount:2,shareCount:2}); expect(anon.items[0]?.viewerHasLiked).toBe(false); expect(PublicIpSchema.parse(anon.items[0]?.author)).toBeTruthy(); expect(anon.items[0]?.author).not.toHaveProperty('followerCount');
  const mine=await social.listFeed({viewer:first,kind:'for_you',limit:25,after:null}); expect(mine.items[0]).toMatchObject({viewerHasLiked:true,viewerHasBookmarked:true,viewerFollowsAuthor:true});
  const other=await social.listFeed({viewer:second,kind:'for_you',limit:25,after:null}); expect(other.items[0]).toMatchObject({viewerHasLiked:false,viewerHasBookmarked:true,viewerFollowsAuthor:false});
 }))
 it('populates strict interaction counts for feed, following, liked, bookmarks, search, profile, and detail',async()=>tx(async client=>{
  const author=await ip(client)
  const actor=await human(client)
  const postId=await post(client,author)
  const social=repo(client)
  await social.follow(actor,author,context())
  await social.likePost(actor,postId,context())
  await social.bookmarkPost(actor,postId)
  await social.recordPostShare(actor,postId,randomUUID())

  const pages=[
   await social.listFeed({viewer:null,kind:'for_you',limit:10,after:null}),
   await social.listFeed({viewer:actor,kind:'following',limit:10,after:null}),
   await social.listBookmarks(actor,{limit:10}),
   await social.listLiked(actor,{limit:10}),
  ]
  const search=await social.search({viewer:null,q:'fixture',category:'posts',limit:10,after:null})
  const profile=await social.getPublicProfile({viewer:null,profileId:author,limit:10,after:null})
  const detail=await social.getPost({viewer:null,postId,commentLimit:10,commentAfter:null})
  if(profile) pages.push(profile.posts)
  const posts=[
   ...pages.flatMap((page)=>page.items),
   ...search.items.flatMap((item)=>item.type==='post'?[item.post]:[]),
   ...(detail?[detail]:[]),
  ]
  expect(posts).toHaveLength(7)
  for(const value of posts) {
   expect(value).toMatchObject({likeCount:1,commentCount:0,bookmarkCount:1,shareCount:1})
   expect(PublicIpSchema.parse(value.author)).toEqual(value.author)
  }
 }))
 it('returns only published current IP profiles with paginated posts and viewer follow state',async()=>tx(async c=>{ const visible=await ip(c),hidden=await ip(c,'draft'),viewer=await human(c),social=repo(c); const older=await post(c,visible,'published','2026-09-01T00:00:00.000Z'); const newer=await post(c,visible,'published','2026-09-01T01:00:00.000Z'); await social.follow(viewer,visible,context()); const anonymous=await social.getPublicProfile({viewer:null,profileId:visible,limit:1,after:null}); expect(anonymous).toMatchObject({profile:{id:visible,kind:'ip'},followerCount:1,posts:{items:[{id:newer}]}}); expect(anonymous).not.toHaveProperty('viewerFollows'); expect(anonymous?.posts.nextCursor).toBeTruthy(); const after=decodeCursor(anonymous!.posts.nextCursor!,'following'); await expect(social.getPublicProfile({viewer:null,profileId:visible,limit:1,after})).resolves.toMatchObject({posts:{items:[{id:older}],nextCursor:null}}); await expect(social.getPublicProfile({viewer,profileId:visible,limit:10,after:null})).resolves.toMatchObject({viewerFollows:true}); await expect(social.getPublicProfile({viewer:null,profileId:hidden,limit:10,after:null})).resolves.toBeNull(); await expect(social.getPublicProfile({viewer:null,profileId:randomUUID(),limit:10,after:null})).resolves.toBeNull() }))
 it('uses the documented absolute score and changes order for the viewer relationship',async()=>tx(async c=>{ const publishedAt='2026-09-01T00:00:00.000Z'; const firstAuthor=await ip(c),secondAuthor=await ip(c); await c.query('UPDATE public.ip_profiles SET feed_weight=7 WHERE profile_id=$1',[firstAuthor]); const firstPost=await post(c,firstAuthor,'published',publishedAt,'en'),secondPost=await post(c,secondAuthor,'published',publishedAt); const viewer=await human(c),liker=await human(c),social=repo(c); await social.likePost(liker,firstPost,context()); const commentId=randomUUID(); await c.query(`INSERT INTO public.comments(id,post_id,author_profile_id,source,body) VALUES($1,$2,$3,'human','score')`,[commentId,firstPost,viewer.id]); const score=await createActorSession({connect:async()=>({query:c.query.bind(c),release(){}})}, {transactionMode:'nested'}).withActor(viewer,async client=>(await client.query<{score:string;like_count:number;comment_count:number}>('SELECT * FROM public.social_post_metrics($1,$2,$3)',[firstPost,firstAuthor,'en'])).rows[0]!); expect(Number(score.score)).toBe(Date.parse(publishedAt)/3_600_000+7+10+2+3); expect(score).toMatchObject({like_count:1,comment_count:1}); const anonymous=await social.listFeed({viewer:null,kind:'for_you',limit:10,after:null}); const lower=anonymous.items.findIndex(item=>item.id===firstPost)>anonymous.items.findIndex(item=>item.id===secondPost)?{author:firstAuthor,post:firstPost}:{author:secondAuthor,post:secondPost}; await social.follow(viewer,lower.author,context()); const personalized=await social.listFeed({viewer,kind:'for_you',limit:10,after:null}); expect(personalized.items[0]?.id).toBe(lower.post) }))
 it('paginates every feed post once while preserving database microseconds',async()=>tx(async c=>{ const author=await ip(c); const ids=[await post(c,author,'published','2026-09-01T00:00:00.000100Z'),await post(c,author,'published','2026-09-01T00:00:00.000500Z'),await post(c,author,'published','2026-09-01T00:00:00.000900Z')]; const viewer=await human(c),social=repo(c); await social.follow(viewer,author,context()); for (const kind of ['for_you','following'] as const) { const found:string[]=[]; let after=null; do { const page=await social.listFeed({viewer:kind==='following'?viewer:null,kind,limit:1,after}); found.push(...page.items.map(item=>item.id)); after=page.nextCursor?decodeCursor(page.nextCursor,kind):null } while(after); expect(found).toEqual(ids.slice().reverse()); expect(new Set(found).size).toBe(ids.length) } }))
 it('rejects commands against posts and IPs outside the public current projection',async()=>tx(async c=>{ const actor=await human(c); const author=await ip(c); const draft=await post(c,author,'draft'); const withdrawn=await post(c,author,'withdrawn'); const hidden=await ip(c,'draft'); const hiddenPost=await post(c,hidden); const missing=randomUUID(); const social=repo(c); await expect(social.createHumanComment(actor,draft,{body:'no'},context())).rejects.toThrow(); await expect(social.createHumanComment(actor,withdrawn,{body:'no'},context())).rejects.toThrow(); await expect(social.follow(actor,hidden,context())).rejects.toThrow(); await expect(social.likePost(actor,hiddenPost,context())).rejects.toThrow(); for(const command of [()=>social.bookmarkPost(actor,hiddenPost),()=>social.bookmarkPost(actor,missing),()=>social.unfollow(actor,hidden),()=>social.unfollow(actor,missing),()=>social.unlikePost(actor,hiddenPost),()=>social.unlikePost(actor,missing),()=>social.unbookmarkPost(actor,hiddenPost),()=>social.unbookmarkPost(actor,missing)]) await expect(command()).rejects.toMatchObject({code:'P0002'}) }))
 it('keeps every visible relationship toggle idempotent through bounded commands',async()=>tx(async c=>{ const actor=await human(c),author=await ip(c),postId=await post(c,author),social=repo(c); await expect(social.follow(actor,author,context())).resolves.toEqual({created:true}); await expect(social.follow(actor,author,context())).resolves.toEqual({created:false}); await expect(social.unfollow(actor,author)).resolves.toEqual({deleted:true}); await expect(social.unfollow(actor,author)).resolves.toEqual({deleted:false}); await expect(social.likePost(actor,postId,context())).resolves.toEqual({created:true}); await expect(social.likePost(actor,postId,context())).resolves.toEqual({created:false}); await expect(social.unlikePost(actor,postId)).resolves.toEqual({deleted:true}); await expect(social.unlikePost(actor,postId)).resolves.toEqual({deleted:false}); await expect(social.bookmarkPost(actor,postId)).resolves.toEqual({created:true}); await expect(social.bookmarkPost(actor,postId)).resolves.toEqual({created:false}); await expect(social.unbookmarkPost(actor,postId)).resolves.toEqual({deleted:true}); await expect(social.unbookmarkPost(actor,postId)).resolves.toEqual({deleted:false}) }))
 it('records authenticated and anonymous shares idempotently without network metadata',async()=>tx(async client=>{
  const author=await ip(client)
  const postId=await post(client,author)
  const otherPostId=await post(client,author)
  const actor=await human(client)
  const social=repo(client)
  const authenticatedKey=randomUUID()
  const anonymousKey=randomUUID()

  await expect(social.recordPostShare(actor,postId,authenticatedKey)).resolves.toEqual({created:true})
  await expect(social.recordPostShare(actor,postId,authenticatedKey)).resolves.toEqual({created:false})
  await expect(social.recordPostShare(null,postId,anonymousKey)).resolves.toEqual({created:true})
  await expect(social.recordPostShare(null,postId,randomUUID())).resolves.toEqual({created:true})
  await expect(social.recordPostShare(null,otherPostId,authenticatedKey)).resolves.toEqual({created:true})

  const rows=await client.query<{actor_profile_id:string|null;idempotency_key:string}>('SELECT actor_profile_id,idempotency_key FROM public.post_share_events WHERE post_id=$1 ORDER BY idempotency_key',[postId])
  expect(rows.rows).toHaveLength(3)
  expect(rows.rows.filter((row)=>row.actor_profile_id===actor.id)).toHaveLength(1)
  expect(rows.rows.filter((row)=>row.actor_profile_id===null)).toHaveLength(2)
  const columns=await client.query<{column_name:string}>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='post_share_events' ORDER BY ordinal_position")
  expect(columns.rows.map((row)=>row.column_name)).toEqual(['id','post_id','actor_profile_id','idempotency_key','created_at'])
  const constraints=await client.query<{definition:string}>("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='post_share_events_post_id_idempotency_key_unique'")
  expect(constraints.rows[0]?.definition).toContain('UNIQUE (post_id, idempotency_key)')
  const indexes=await client.query<{indexdef:string}>("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='post_share_events_post_created_idx'")
  expect(indexes.rows[0]?.indexdef).toContain('(post_id, created_at DESC)')
 }))
 it('rejects shares outside the public current projection and exposes only the bounded command',async()=>tx(async client=>{
  const actor=await human(client)
  const visibleAuthor=await ip(client)
  const hiddenAuthor=await ip(client,'draft')
  const invalidCreatorAuthor=await ip(client)
  await client.query("UPDATE public.ip_profiles SET source='creator',active_creator_revision_id=NULL WHERE profile_id=$1",[invalidCreatorAuthor])
  const draft=await post(client,visibleAuthor,'draft')
  const withdrawn=await post(client,visibleAuthor,'withdrawn')
  const hidden=await post(client,hiddenAuthor)
  const invalidCreatorPost=await post(client,invalidCreatorAuthor)
  const targets=[draft,withdrawn,hidden,invalidCreatorPost,randomUUID()]
  const social=repo(client)

  for(const target of targets) {
   await expect(social.recordPostShare(actor,target,randomUUID())).rejects.toMatchObject({code:'P0002'})
   await expect(social.recordPostShare(null,target,randomUUID())).rejects.toMatchObject({code:'P0002'})
  }
  await expect(client.query('SELECT 1 FROM public.post_share_events WHERE post_id=ANY($1::uuid[])',[targets])).resolves.toMatchObject({rowCount:0})

  await client.query('SET LOCAL ROLE aifans_anon')
  const anon=await client.query<{execute:boolean;select_rows:boolean;insert_rows:boolean}>("SELECT has_function_privilege(current_user,'public.record_post_share(uuid,uuid)','EXECUTE') execute,has_table_privilege(current_user,'public.post_share_events','SELECT') select_rows,has_table_privilege(current_user,'public.post_share_events','INSERT') insert_rows")
  expect(anon.rows[0]).toEqual({execute:true,select_rows:false,insert_rows:false})
  await client.query('SET LOCAL ROLE NONE')
  await client.query('SET LOCAL ROLE aifans_authenticated')
  const authenticated=await client.query<{execute:boolean;select_rows:boolean;insert_rows:boolean}>("SELECT has_function_privilege(current_user,'public.record_post_share(uuid,uuid)','EXECUTE') execute,has_table_privilege(current_user,'public.post_share_events','SELECT') select_rows,has_table_privilege(current_user,'public.post_share_events','INSERT') insert_rows")
  expect(authenticated.rows[0]).toEqual({execute:true,select_rows:false,insert_rows:false})
 }))
 it('allows like, unlike, and re-like while retaining one notification and emitting each created-like event', async () => tx(async (client) => {
  const actor = await human(client)
  const author = await ip(client)
  const postId = await post(client, author)
  const social = repo(client)

  await expect(social.likePost(actor, postId, context())).resolves.toEqual({created: true})
  await expect(social.unlikePost(actor, postId)).resolves.toEqual({deleted: true})
  await expect(social.likePost(actor, postId, context())).resolves.toEqual({created: true})

  await expect(client.query(
   'SELECT count(*)::int AS count FROM public.post_likes WHERE post_id=$1 AND profile_id=$2',
   [postId, actor.id],
  )).resolves.toMatchObject({rows: [{count: 1}]})
  await expect(client.query(
   "SELECT count(*)::int AS count FROM public.notifications WHERE recipient_profile_id=$1 AND actor_profile_id=$2 AND post_id=$3 AND kind='post_like'",
   [author, actor.id, postId],
  )).resolves.toMatchObject({rows: [{count: 1}]})
  await expect(client.query(
   "SELECT count(*)::int AS count FROM public.business_events WHERE actor_profile_id=$1 AND subject_entity_id=$2 AND event_name='post_liked'",
   [actor.id, postId],
  )).resolves.toMatchObject({rows: [{count: 2}]})
  await expect(client.query(
   "SELECT count(*)::int AS count FROM public.analytics_outbox outbox JOIN public.business_events event ON event.id=outbox.business_event_id WHERE event.actor_profile_id=$1 AND event.subject_entity_id=$2 AND event.event_name='post_liked'",
   [actor.id, postId],
  )).resolves.toMatchObject({rows: [{count: 2}]})
 }))
 it('exposes only bounded authenticated command signatures and no direct relationship writes',async()=>tx(async c=>{ await c.query('SET LOCAL ROLE aifans_authenticated'); const privileges=await c.query<{old_follow:boolean;old_like:boolean;old_comment:boolean;new_follow:boolean;new_like:boolean;new_comment:boolean;follows_insert:boolean;follows_delete:boolean;likes_insert:boolean;likes_delete:boolean;bookmarks_insert:boolean;bookmarks_delete:boolean;likes_select:boolean;bookmarks_select:boolean}>(`SELECT has_function_privilege(current_user,'public.follow_profile(uuid,uuid,uuid,text)','EXECUTE') old_follow,has_function_privilege(current_user,'public.like_post(uuid,uuid,uuid,text)','EXECUTE') old_like,has_function_privilege(current_user,'public.create_human_comment(uuid,uuid,uuid,text,uuid,uuid,text)','EXECUTE') old_comment,has_function_privilege(current_user,'public.follow_profile(uuid,uuid)','EXECUTE') new_follow,has_function_privilege(current_user,'public.like_post(uuid,uuid)','EXECUTE') new_like,has_function_privilege(current_user,'public.create_human_comment(uuid,uuid,text,uuid)','EXECUTE') new_comment,has_table_privilege(current_user,'public.follows','INSERT') follows_insert,has_table_privilege(current_user,'public.follows','DELETE') follows_delete,has_table_privilege(current_user,'public.post_likes','INSERT') likes_insert,has_table_privilege(current_user,'public.post_likes','DELETE') likes_delete,has_table_privilege(current_user,'public.bookmarks','INSERT') bookmarks_insert,has_table_privilege(current_user,'public.bookmarks','DELETE') bookmarks_delete,has_table_privilege(current_user,'public.post_likes','SELECT') likes_select,has_table_privilege(current_user,'public.bookmarks','SELECT') bookmarks_select`); expect(privileges.rows[0]).toEqual({old_follow:false,old_like:false,old_comment:false,new_follow:true,new_like:true,new_comment:true,follows_insert:false,follows_delete:false,likes_insert:false,likes_delete:false,bookmarks_insert:false,bookmarks_delete:false,likes_select:true,bookmarks_select:true}) }))
 it('grants only authenticated callers the bounded followed-IP projection',async()=>tx(async c=>{ const privileges=await c.query<{authenticated:boolean;anonymous:boolean;platform:boolean;direct_select:boolean}>(`SELECT has_function_privilege('aifans_authenticated','public.social_followed_ip_profiles(timestamptz,uuid,integer)','EXECUTE') authenticated,has_function_privilege('aifans_anon','public.social_followed_ip_profiles(timestamptz,uuid,integer)','EXECUTE') anonymous,has_function_privilege('aifans_platform','public.social_followed_ip_profiles(timestamptz,uuid,integer)','EXECUTE') platform,has_table_privilege('aifans_authenticated','public.follows','SELECT') direct_select`); expect(privileges.rows[0]).toEqual({authenticated:true,anonymous:false,platform:false,direct_select:false}) }))
 it('projects newest root groups first while preserving chronological replies and a deleted root tombstone',async()=>tx(async c=>{
  const actor=await human(c),author=await ip(c),postId=await post(c,author),social=repo(c)
  const firstRoot={id:randomUUID()},firstReply={id:randomUUID()},secondReply={id:randomUUID()},secondRoot={id:randomUUID()}
  await c.query(`INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body,created_at) VALUES($1,$2,NULL,$3,'human','first','2026-09-01T00:00:00.000100Z')`,[firstRoot.id,postId,actor.id])
  await c.query(`INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body,created_at) VALUES($1,$2,$3,$4,'human','reply one','2026-09-01T00:00:00.000200Z')`,[firstReply.id,postId,firstRoot.id,actor.id])
  await c.query(`INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body,created_at) VALUES($1,$2,$3,$4,'human','reply two','2026-09-01T00:00:00.000300Z')`,[secondReply.id,postId,firstReply.id,actor.id])
  await c.query(`INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body,created_at) VALUES($1,$2,NULL,$3,'human','second','2026-09-01T00:00:00.000400Z')`,[secondRoot.id,postId,actor.id])
  await c.query("UPDATE public.comments SET state='deleted',deleted_at=clock_timestamp() WHERE id=$1",[firstRoot.id])
  const first=await social.getPost({viewer:null,postId,commentLimit:1,commentAfter:null})
  expect(first?.comments.groups.map(group=>group.root.id)).toEqual([secondRoot.id])
  expect(first?.comments.nextCursor).toBeTruthy()
  const {decodeCommentCursor}=await import('@aifans/contracts')
  const after=decodeCommentCursor(first!.comments.nextCursor!,postId)
  expect(after).toMatchObject({order:'root_created_at_desc_v1'})
  const second=await social.getPost({viewer:null,postId,commentLimit:1,commentAfter:after})
  const groups=[...(first?.comments.groups??[]),...(second?.comments.groups??[])]
  expect(groups.map(group=>group.root.id)).toEqual([secondRoot.id,firstRoot.id])
  const tombstone=groups[1]!
  expect(tombstone).toEqual({root:expect.objectContaining({id:firstRoot.id,state:'deleted',author:null,rootCommentId:firstRoot.id}),replies:[expect.objectContaining({id:firstReply.id,parentCommentId:firstRoot.id,rootCommentId:firstRoot.id}),expect.objectContaining({id:secondReply.id,parentCommentId:firstReply.id,rootCommentId:firstRoot.id})]})
  expect(tombstone.root).not.toHaveProperty('body')
  expect(second?.comments.nextCursor).toBeNull()
 }))
 it('reads post metrics and comment threads in one database snapshot statement',async()=>tx(async c=>{ const author=await ip(c),postId=await post(c,author),statements:string[]=[]; const social=createSocialRepository({withPublic:async fn=>fn({query:async(text,values)=>{statements.push(text);return c.query(text,values)},release(){}})}); await social.getPost({viewer:null,postId,commentLimit:10,commentAfter:null}); expect(statements).toHaveLength(1); expect(statements[0]).toMatch(/WITH base AS MATERIALIZED[\s\S]*LEFT JOIN LATERAL public\.social_public_comment_threads/) }))
 it('uses a zero-metric non-leaking tombstone for a hidden IP root only when it has public descendants',async()=>tx(async c=>{ const postAuthor=await ip(c),commentIp=await ip(c),actor=await human(c),postId=await post(c,postAuthor),root=randomUUID(); await c.query("INSERT INTO public.comments(id,post_id,author_profile_id,source,body) VALUES($1,$2,$3,'worker','private former identity')",[root,postId,commentIp]); const social=repo(c); const reply=await social.createHumanComment(actor,postId,{body:'public reply',parentCommentId:root},context()); await social.likeComment(actor,root,context()); await social.bookmarkComment(actor,root); await social.recordCommentShare(null,root,randomUUID()); await c.query("UPDATE public.ip_profiles SET public_state='unpublished',operation_enabled=false WHERE profile_id=$1",[commentIp]); for(const operation of [()=>social.likeComment(actor,root,context()),()=>social.bookmarkComment(actor,root),()=>social.recordCommentShare(null,root,randomUUID()),()=>social.createHumanComment(actor,postId,{body:'blocked',parentCommentId:root},context())]) await expect(operation()).rejects.toMatchObject({code:expect.stringMatching(/P0001|P0002/)}); const detail=await social.getPost({viewer:actor,postId,commentLimit:10,commentAfter:null}); const group=detail?.comments.groups.find(item=>item.root.id===root); expect(group?.root).toMatchObject({id:root,state:'deleted',author:null,likeCount:0,replyCount:0,bookmarkCount:0,shareCount:0,viewerHasLiked:false,viewerHasBookmarked:false}); expect(group?.root).not.toHaveProperty('body'); expect(group?.replies).toEqual([expect.objectContaining({id:reply.id,body:'public reply'})]) }))
 it('does not emit a hidden IP root with no public descendants or only hidden descendants',async()=>tx(async c=>{ const postAuthor=await ip(c),firstIp=await ip(c),secondIp=await ip(c),postId=await post(c,postAuthor),root=randomUUID(),child=randomUUID(); await c.query("INSERT INTO public.comments(id,post_id,author_profile_id,source,body) VALUES($1,$2,$3,'worker','hidden root')",[root,postId,firstIp]); await c.query("INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body) VALUES($1,$2,$3,$4,'worker','hidden child')",[child,postId,root,secondIp]); await c.query("UPDATE public.ip_profiles SET public_state='unpublished',operation_enabled=false WHERE profile_id=ANY($1::uuid[])",[[firstIp,secondIp]]); const detail=await repo(c).getPost({viewer:null,postId,commentLimit:10,commentAfter:null}); expect(detail?.comments.groups).toEqual([]) }))
 it('counts only public direct children and omits hidden direct children',async()=>tx(async c=>{ const postAuthor=await ip(c),hiddenAuthor=await ip(c),actor=await human(c),postId=await post(c,postAuthor),social=repo(c); const root=await social.createHumanComment(actor,postId,{body:'root'},context()); const publicChild=await social.createHumanComment(actor,postId,{body:'public child',parentCommentId:root.id},context()); const hiddenChild=randomUUID(); await c.query("INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body) VALUES($1,$2,$3,$4,'worker','hidden child')",[hiddenChild,postId,root.id,hiddenAuthor]); await c.query("UPDATE public.ip_profiles SET public_state='unpublished',operation_enabled=false WHERE profile_id=$1",[hiddenAuthor]); const detail=await social.getPost({viewer:null,postId,commentLimit:10,commentAfter:null}); const group=detail?.comments.groups.find(item=>item.root.id===root.id); expect(group?.root.replyCount).toBe(1); expect(group?.replies.map(item=>item.id)).toEqual([publicChild.id]) }))
 it('returns the complete root group for a public deep-link target and rejects deleted, hidden, and cross-post targets',async()=>tx(async c=>{ const postAuthor=await ip(c),hiddenAuthor=await ip(c),actor=await human(c),postId=await post(c,postAuthor),otherPostId=await post(c,postAuthor),social=repo(c); const root=await social.createHumanComment(actor,postId,{body:'root'},context()); const reply=await social.createHumanComment(actor,postId,{body:'reply',parentCommentId:root.id},context()); const nested=await social.createHumanComment(actor,postId,{body:'nested',parentCommentId:reply.id},context()); const hidden=randomUUID(); await c.query("INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body) VALUES($1,$2,$3,$4,'worker','hidden')",[hidden,postId,root.id,hiddenAuthor]); await c.query("UPDATE public.ip_profiles SET public_state='unpublished',operation_enabled=false WHERE profile_id=$1",[hiddenAuthor]); await c.query("UPDATE public.comments SET state='deleted',deleted_at=clock_timestamp() WHERE id=$1",[root.id]); const result=await social.getCommentThread({viewer:null,postId,commentId:nested.id}); expect(result?.group.root).toMatchObject({id:root.id,state:'deleted',author:null}); expect(result?.group.replies.map(item=>item.id).sort()).toEqual([reply.id,nested.id].sort()); await expect(social.getCommentThread({viewer:null,postId,commentId:root.id})).resolves.toBeNull(); await expect(social.getCommentThread({viewer:null,postId,commentId:hidden})).resolves.toBeNull(); await expect(social.getCommentThread({viewer:null,postId:otherPostId,commentId:nested.id})).resolves.toBeNull() }))
 it('finds an older deep-link target beyond the first fifty newest root groups',async()=>tx(async c=>{ const postAuthor=await ip(c),actor=await human(c),postId=await post(c,postAuthor),social=repo(c); const target=await social.createHumanComment(actor,postId,{body:'target root'},context()); for(let index=0;index<51;index+=1) await social.createHumanComment(actor,postId,{body:`newer ${index}`},context()); const result=await social.getCommentThread({viewer:null,postId,commentId:target.id}); expect(result).toEqual({group:{root:expect.objectContaining({id:target.id,body:'target root'}),replies:[]}}) }))

 it('returns newly created human comments with a human author',async()=>tx(async c=>{ const actor=await human(c),author=await ip(c),postId=await post(c,author),social=repo(c); const created=await social.createHumanComment(actor,postId,{body:'human words'},context()); expect(created).toMatchObject({postId,body:'human words',author:{kind:'human',id:actor.id}}) }))
 it('rejects a root comment when the post creator identity is no longer canonical',async()=>tx(async c=>{ const actor=await human(c),author=await ip(c),postId=await post(c,author),social=repo(c); await c.query("UPDATE public.ip_profiles SET source='creator',active_creator_revision_id=NULL WHERE profile_id=$1",[author]); await expect(social.createHumanComment(actor,postId,{body:'must stay hidden'},context())).rejects.toMatchObject({code:'P0002'}); await expect(c.query("SELECT 1 FROM public.comments WHERE post_id=$1 AND body='must stay hidden'",[postId])).resolves.toMatchObject({rowCount:0}) }))
 it('keeps comment like, bookmark, and share commands idempotent and projects direct counts/viewer flags',async()=>tx(async c=>{ const actor=await human(c),author=await ip(c),postId=await post(c,author),social=repo(c); const root=await social.createHumanComment(actor,postId,{body:'root'},context()); const reply=await social.createHumanComment(actor,postId,{body:'reply',parentCommentId:root.id},context()); await expect(social.likeComment(actor,root.id,context())).resolves.toEqual({created:true}); await expect(social.likeComment(actor,root.id,context())).resolves.toEqual({created:false}); await expect(social.bookmarkComment(actor,root.id)).resolves.toEqual({created:true}); await expect(social.bookmarkComment(actor,root.id)).resolves.toEqual({created:false}); const shareKey=randomUUID(); await expect(social.recordCommentShare(null,root.id,shareKey)).resolves.toEqual({created:true}); await expect(social.recordCommentShare(null,root.id,shareKey)).resolves.toEqual({created:false}); const detail=await social.getPost({viewer:actor,postId,commentLimit:10,commentAfter:null}); expect(detail?.comments.groups[0]?.root).toMatchObject({id:root.id,likeCount:1,replyCount:1,bookmarkCount:1,shareCount:1,viewerHasLiked:true,viewerHasBookmarked:true}); expect(detail?.comments.groups[0]?.replies[0]).toMatchObject({id:reply.id,replyCount:0}); await expect(social.unlikeComment(actor,root.id)).resolves.toEqual({deleted:true}); await expect(social.unlikeComment(actor,root.id)).resolves.toEqual({deleted:false}); await expect(social.unbookmarkComment(actor,root.id)).resolves.toEqual({deleted:true}); await expect(social.unbookmarkComment(actor,root.id)).resolves.toEqual({deleted:false}); await c.query("UPDATE public.comments SET state='deleted',deleted_at=clock_timestamp() WHERE id=$1",[root.id]); await expect(social.likeComment(actor,root.id,context())).rejects.toMatchObject({code:'P0002'}); await expect(social.recordCommentShare(null,root.id,randomUUID())).rejects.toMatchObject({code:'P0002'}) }))
 it('preserves one comment-like notification across unlike and relike',async()=>tx(async c=>{ const commentAuthor=await human(c),liker=await human(c),author=await ip(c),postId=await post(c,author),social=repo(c); const root=await social.createHumanComment(commentAuthor,postId,{body:'root'},context()); await social.likeComment(liker,root.id,context()); await social.unlikeComment(liker,root.id); await social.likeComment(liker,root.id,context()); await expect(c.query("SELECT count(*)::int count FROM public.notifications WHERE recipient_profile_id=$1 AND actor_profile_id=$2 AND comment_id=$3 AND kind='comment_like'",[commentAuthor.id,liker.id,root.id])).resolves.toMatchObject({rows:[{count:1}]}) }))
 it('writes one correlated comment_liked event and outbox only when the relationship is created',async()=>tx(async c=>{ const commentAuthor=await human(c),liker=await human(c),author=await ip(c),postId=await post(c,author),social=repo(c),command=context(); const root=await social.createHumanComment(commentAuthor,postId,{body:'root'},context()); await social.likeComment(liker,root.id,command); await social.likeComment(liker,root.id,context()); const rows=await c.query(`SELECT event.request_id,event.environment,outbox.business_event_id,outbox.payload FROM public.business_events event JOIN public.analytics_outbox outbox ON outbox.business_event_id=event.id WHERE event.event_name='comment_liked' AND event.actor_profile_id=$1 AND event.subject_entity_id=$2`,[liker.id,root.id]); expect(rows.rows).toHaveLength(1); expect(rows.rows[0]).toMatchObject({request_id:command.requestId,environment:'api',business_event_id:expect.any(String),payload:{event_name:'comment_liked',event_version:1,request_id:command.requestId}}) }))
 it('rolls back comment like, notification, event, and outbox when outbox insertion fails',async()=>tx(async c=>{ const commentAuthor=await human(c),liker=await human(c),author=await ip(c),postId=await post(c,author),social=repo(c); const root=await social.createHumanComment(commentAuthor,postId,{body:'root'},context()); await c.query(`CREATE FUNCTION pg_temp.reject_comment_like_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->>'event_name'='comment_liked' THEN RAISE EXCEPTION 'forced comment outbox failure'; END IF; RETURN NEW; END $$`); await c.query(`CREATE TRIGGER reject_comment_like_outbox BEFORE INSERT ON public.analytics_outbox FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_comment_like_outbox()`); await expect(social.likeComment(liker,root.id,context())).rejects.toThrow('forced comment outbox failure'); await expect(c.query('SELECT 1 FROM public.comment_likes WHERE comment_id=$1 AND profile_id=$2',[root.id,liker.id])).resolves.toMatchObject({rowCount:0}); await expect(c.query("SELECT 1 FROM public.notifications WHERE comment_id=$1 AND actor_profile_id=$2 AND kind='comment_like'",[root.id,liker.id])).resolves.toMatchObject({rowCount:0}); await expect(c.query("SELECT 1 FROM public.business_events WHERE subject_entity_id=$1 AND actor_profile_id=$2 AND event_name='comment_liked'",[root.id,liker.id])).resolves.toMatchObject({rowCount:0}) }))
 it('keeps exact arbitrary-depth parents and rejects deleted, cross-post, and missing parents',async()=>tx(async c=>{ const postAuthor=await ip(c),parentAuthor=await human(c),replier=await human(c),otherPostAuthor=await ip(c),postId=await post(c,postAuthor),otherPost=await post(c,otherPostAuthor),social=repo(c); const parent=await social.createHumanComment(parentAuthor,postId,{body:'parent'},context()); const reply=await social.createHumanComment(replier,postId,{body:'reply',parentCommentId:parent.id},context()); const nested=await social.createHumanComment(parentAuthor,postId,{body:'nested',parentCommentId:reply.id},context()); expect(nested).toMatchObject({parentCommentId:reply.id,rootCommentId:parent.id}); await expect(c.query("SELECT recipient_profile_id,kind FROM public.notifications WHERE comment_id=$1",[nested.id])).resolves.toMatchObject({rows:[{recipient_profile_id:replier.id,kind:'reply'}]}); await c.query("UPDATE public.comments SET state='deleted',deleted_at=clock_timestamp() WHERE id=$1",[reply.id]); await expect(social.createHumanComment(replier,postId,{body:'deleted',parentCommentId:reply.id},context())).rejects.toThrow('invalid reply parent'); const wrong=await social.createHumanComment(parentAuthor,otherPost,{body:'wrong post parent'},context()); await expect(social.createHumanComment(replier,postId,{body:'wrong',parentCommentId:wrong.id},context())).rejects.toThrow('invalid reply parent'); await expect(social.createHumanComment(replier,postId,{body:'missing',parentCommentId:randomUUID()},context())).rejects.toThrow('invalid reply parent') }))
 it('rejects a comment when a concurrent post withdrawal wins the visibility lock',async()=>expectVisibilityChangeToWin(async(client,{postId})=>{await client.query("UPDATE public.posts SET state='withdrawn',withdrawn_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1",[postId])}))
 it('rejects a comment when a concurrent IP unpublish wins the visibility lock',async()=>expectVisibilityChangeToWin(async(client,{author})=>{await client.query("UPDATE public.ip_profiles SET public_state='unpublished',operation_enabled=false,updated_at=clock_timestamp() WHERE profile_id=$1",[author])}))
 it('serializes a comment interaction behind a concurrent soft delete and then rejects it without leakage',async()=>{
  const fixture=await committedShareFixture(),setup=await pool.connect(),deleter=await pool.connect(),actorClient=await pool.connect()
  try {
   await setup.query('BEGIN'); const root=await repo(setup).createHumanComment(fixture.actor,fixture.postId,{body:'race target'},context()); await setup.query('COMMIT')
   await deleter.query('BEGIN'); await deleter.query("UPDATE public.comments SET state='deleted',deleted_at=clock_timestamp() WHERE id=$1",[root.id])
   await actorClient.query('BEGIN'); const attempt=bounded(repo(actorClient).likeComment(fixture.actor,root.id,context()).then(value=>({ok:true as const,value})).catch((error:unknown)=>({ok:false as const,error})),'comment interaction race')
   await new Promise(resolve=>setTimeout(resolve,25)); await deleter.query('COMMIT'); const outcome=await attempt
   expect(outcome.ok).toBe(false); if(!outcome.ok) expect(outcome.error).toMatchObject({code:'P0002'})
  } finally { await Promise.all([setup.query('ROLLBACK').catch(()=>undefined),deleter.query('ROLLBACK').catch(()=>undefined),actorClient.query('ROLLBACK').catch(()=>undefined)]); setup.release();deleter.release();actorClient.release(); await cleanupCommittedShareFixture(fixture) }
 })
 it.each(['like','bookmark','share','human_reply','platform_reply'] as const)('waits for a concurrent comment-author unpublish before rejecting %s',async operation=>{
  const fixture=await committedShareFixture(),setup=await pool.connect(),unpublisher=await pool.connect(),actorClient=await pool.connect()
  try {
   await setup.query('BEGIN'); const root=randomUUID(); await setup.query("INSERT INTO public.comments(id,post_id,author_profile_id,source,body) VALUES($1,$2,$3,'worker','IP root')",[root,fixture.postId,fixture.represented]); await setup.query('COMMIT')
   await unpublisher.query('BEGIN'); await unpublisher.query("UPDATE public.ip_profiles SET public_state='unpublished',operation_enabled=false WHERE profile_id=$1",[fixture.represented])
   await actorClient.query('BEGIN'); const pid=(await actorClient.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid; const actorRepo=repo(actorClient)
   const rawAttempt=operation==='like' ? actorRepo.likeComment(fixture.actor,root,context())
    : operation==='bookmark' ? actorRepo.bookmarkComment(fixture.actor,root)
    : operation==='share' ? actorRepo.recordCommentShare(null,root,randomUUID())
    : operation==='human_reply' ? actorRepo.createHumanComment(fixture.actor,fixture.postId,{body:'blocked human reply',parentCommentId:root},context())
    : createPlatformSession({connect:async()=>({query:actorClient.query.bind(actorClient),release(){}})},{transactionMode:'nested'}).withPlatformActor(fixture.operator,async client=>(await client.query('SELECT * FROM public.platform_publish_ip_comment($1,$2,$3,$4,$5)',[fixture.postId,fixture.author,'blocked platform reply',root,randomUUID()])).rows[0])
   const attempt=bounded(rawAttempt.then(value=>({ok:true as const,value})).catch((error:unknown)=>({ok:false as const,error})),`${operation} author visibility race`)
   await expectSessionToWaitOnLock(unpublisher,pid,attempt)
   await unpublisher.query('COMMIT'); const outcome=await attempt
   expect(outcome.ok).toBe(false); if(!outcome.ok) expect(outcome.error).toMatchObject({code:operation==='platform_reply'?'23514':expect.stringMatching(/P0001|P0002/)})
  } finally { await Promise.all([setup.query('ROLLBACK').catch(()=>undefined),unpublisher.query('ROLLBACK').catch(()=>undefined),actorClient.query('ROLLBACK').catch(()=>undefined)]); setup.release();unpublisher.release();actorClient.release(); await cleanupCommittedShareFixture(fixture) }
 })
 it('serializes concurrent direct replies on the root without deadlock or forged grouping',async()=>{
  const fixture=await committedShareFixture(),setup=await pool.connect(),first=await pool.connect(),second=await pool.connect()
  try {
   await setup.query('BEGIN'); const root=await repo(setup).createHumanComment(fixture.actor,fixture.postId,{body:'root'},context()); await setup.query('COMMIT')
   await first.query('BEGIN'); await second.query('BEGIN')
   const one=await repo(first).createHumanComment(fixture.actor,fixture.postId,{body:'one',parentCommentId:root.id},context())
   const pending=bounded(repo(second).createHumanComment(fixture.actor,fixture.postId,{body:'two',parentCommentId:root.id},context()),'second root reply')
   await first.query('COMMIT'); const two=await pending; await second.query('COMMIT')
   expect([one,two]).toEqual([expect.objectContaining({rootCommentId:root.id,parentCommentId:root.id}),expect.objectContaining({rootCommentId:root.id,parentCommentId:root.id})])
  } finally { await Promise.all([setup.query('ROLLBACK').catch(()=>undefined),first.query('ROLLBACK').catch(()=>undefined),second.query('ROLLBACK').catch(()=>undefined)]); setup.release();first.release();second.release(); await cleanupCommittedShareFixture(fixture) }
 })
 it.each(['withdraw','unpublish'] as const)('does not record when concurrent %s wins the visibility lock',async change=>{
  const fixture=await committedShareFixture()
  const stateClient=await pool.connect()
  const shareClient=await pool.connect()
  const activePids:number[]=[]
  let attempt:Promise<{ok:true;value:unknown}|{ok:false;error:unknown}>|undefined
  try {
   await beginBounded(stateClient)
   await beginBounded(shareClient)
   const statePid=(await stateClient.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
   const sharePid=(await shareClient.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
   activePids.push(statePid,sharePid)
   if(change==='withdraw') await stateClient.query("UPDATE public.posts SET state='withdrawn',withdrawn_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1",[fixture.postId])
   else await stateClient.query("UPDATE public.ip_profiles SET public_state='unpublished',operation_enabled=false,updated_at=clock_timestamp() WHERE profile_id=$1",[fixture.author])
   const rawAttempt=repo(shareClient).recordPostShare(null,fixture.postId,randomUUID())
   attempt=bounded(rawAttempt.then((value)=>({ok:true as const,value})).catch((error:unknown)=>({ok:false as const,error})),'visibility share statement')
   await expectSessionToWaitOnLock(stateClient,sharePid,attempt)
   await bounded(stateClient.query('COMMIT'),'visibility change commit')
   const outcome=await bounded(attempt,'visibility share settlement')
   expect(outcome.ok).toBe(false)
   if(!outcome.ok) expect(outcome.error).toMatchObject({code:'P0002'})
   await bounded(shareClient.query('ROLLBACK'),'aborted share rollback')
   await expect(stateClient.query('SELECT 1 FROM public.post_share_events WHERE post_id=$1',[fixture.postId])).resolves.toMatchObject({rowCount:0})
  } finally {
   if(activePids.length) await bounded(pool.query('SELECT pg_cancel_backend(pid) FROM unnest($1::int[]) AS active(pid)',[activePids]),'visibility backend cancellation').catch(()=>undefined)
   if(attempt) await Promise.allSettled([bounded(attempt,'visibility share cleanup')])
   await Promise.all([rollbackAndRelease(stateClient),rollbackAndRelease(shareClient)])
   await cleanupCommittedShareFixture(fixture)
  }
 })
 it('keeps share and human-comment commands on the canonical post-first lock order',async()=>expectShareCommentLockOrder('human'))
 it('keeps share and platform-comment commands on the canonical post-first lock order',async()=>expectShareCommentLockOrder('platform'))
 it('orders an authenticated operator share before the same operator platform comment',async()=>expectShareCommentLockOrder('platform','operator'))
 it('keeps bookmarks private and bookmark toggles idempotent',async()=>tx(async c=>{ const author=await ip(c); const postId=await post(c,author); const first=await human(c),second=await human(c); const social=repo(c); await expect(social.bookmarkPost(first,postId)).resolves.toEqual({created:true}); await expect(social.bookmarkPost(first,postId)).resolves.toEqual({created:false}); await expect(social.listBookmarks(first,{limit:10})).resolves.toMatchObject({items:[{id:postId}]}); await expect(social.listBookmarks(second,{limit:10})).resolves.toEqual({items:[],nextCursor:null}); await expect(social.unbookmarkPost(first,postId)).resolves.toEqual({deleted:true}); await expect(social.unbookmarkPost(first,postId)).resolves.toEqual({deleted:false}) }))
 it('orders saved posts by the latest bookmark action across stable cursor pages',async()=>tx(async c=>{ const author=await ip(c),actor=await human(c),publishedOld=await post(c,author,'published','2026-09-01T00:00:00.000000Z'),publishedNew=await post(c,author,'published','2026-09-01T01:00:00.000000Z'),social=repo(c); await c.query(`INSERT INTO public.bookmarks(post_id,profile_id,created_at) VALUES($1,$2,'2026-09-02T00:00:00.000900Z'),($3,$2,'2026-09-02T00:00:00.000100Z')`,[publishedOld,actor.id,publishedNew]); const first=await social.listBookmarks(actor,{limit:1}); expect(first.items.map(item=>item.id)).toEqual([publishedOld]); expect(decodeSavedCursor(first.nextCursor!)).toMatchObject({kind:'saved',order:'saved_at_desc_v1',savedAt:'2026-09-02T00:00:00.000900Z'}); const second=await social.listBookmarks(actor,{limit:10,cursor:first.nextCursor!}); expect(second).toEqual({items:[expect.objectContaining({id:publishedNew})],nextCursor:null}) }))
 it('lists only an owner’s followed published IPs across stable cursor pages',async()=>tx(async c=>{ const older=await ip(c),newer=await ip(c),hidden=await ip(c,'draft'),otherIp=await ip(c),actor=await human(c),other=await human(c); await c.query(`UPDATE public.ip_profiles SET created_at=CASE profile_id WHEN $1 THEN '2026-09-01T00:00:00.000100Z'::timestamptz WHEN $2 THEN '2026-09-01T00:00:00.000900Z'::timestamptz ELSE created_at END WHERE profile_id IN ($1,$2)`,[older,newer]); await c.query(`INSERT INTO public.follows(follower_profile_id,followed_profile_id) VALUES($1,$2),($1,$3),($1,$4),($5,$6)`,[actor.id,older,newer,hidden,other.id,otherIp]); const social=repo(c); const first=await social.listFollowedIps(actor,{limit:1}); expect(first.items).toEqual([expect.objectContaining({id:newer,followerCount:1})]); expect(decodeFollowedIpCursor(first.nextCursor!)).toMatchObject({kind:'followed_ips',id:newer}); const second=await social.listFollowedIps(actor,{limit:10,cursor:first.nextCursor!}); expect(second).toEqual({items:[expect.objectContaining({id:older,followerCount:1})],nextCursor:null}); await expect(social.listFollowedIps(other,{limit:10})).resolves.toEqual({items:[expect.objectContaining({id:otherIp,followerCount:1})],nextCursor:null}) }))
 it('filters hidden followed IPs before applying the projection page bound',async()=>tx(async c=>{ const actor=await human(c),visible=await ip(c),hiddenIds=await Promise.all(Array.from({length:51},()=>ip(c,'draft'))); await c.query(`UPDATE public.ip_profiles SET created_at='2026-09-01T00:00:00.000100Z' WHERE profile_id=$1`,[visible]); await c.query(`INSERT INTO public.follows(follower_profile_id,followed_profile_id) SELECT $1,id FROM unnest($2::uuid[]) ids(id)`,[actor.id,[visible,...hiddenIds]]); const rows=await createActorSession({connect:async()=>({query:c.query.bind(c),release(){}})},{transactionMode:'nested'}).withActor(actor,async client=>(await client.query<{id:string}>('SELECT id FROM public.social_followed_ip_profiles(NULL,NULL,51)')).rows); expect(rows).toEqual([{id:visible}]) }))
 it('rejects wrong-kind cursors for bookmark pages',async()=>tx(async c=>{ const actor=await human(c); const social=repo(c); const wrong=encodeCursor({v:1,kind:'for_you',score:0,publishedAt:'2026-09-01T00:00:00.000Z',id:randomUUID()}); await expect(social.listBookmarks(actor,{limit:10,cursor:wrong})).rejects.toThrow('INVALID_CURSOR') }))
 it('lists only an owner’s liked published posts with a stable liked cursor',async()=>tx(async c=>{ const author=await ip(c),otherAuthor=await ip(c),actor=await human(c),other=await human(c),visibleOld=await post(c,author,'published','2026-09-01T00:00:00.000000Z'),visibleNew=await post(c,author,'published','2026-09-01T01:00:00.000000Z'),draft=await post(c,author,'draft'),withdrawn=await post(c,author,'withdrawn','2026-09-01T02:00:00.000000Z'),otherPost=await post(c,otherAuthor),social=repo(c); await c.query(`INSERT INTO public.post_likes(post_id,profile_id,created_at) VALUES($1,$2,'2026-09-02T00:00:00.000100Z'),($3,$2,'2026-09-02T00:00:00.000900Z'),($4,$2,'2026-09-02T00:00:00.001100Z'),($5,$2,'2026-09-02T00:00:00.001500Z'),($6,$7,'2026-09-02T00:00:00.002000Z')`,[visibleOld,actor.id,visibleNew,draft,withdrawn,otherPost,other.id]); const first=await social.listLiked(actor,{limit:1}); expect(first.items.map(x=>x.id)).toEqual([visibleNew]); expect(first.nextCursor).toBeTruthy(); const cursor=decodeLikedCursor(first.nextCursor!); expect(cursor).toMatchObject({kind:'liked',likedAt:'2026-09-02T00:00:00.000900Z'}); const second=await social.listLiked(actor,{limit:10,cursor:first.nextCursor!}); expect(second.items.map(x=>x.id)).toEqual([visibleOld]); await expect(social.listLiked(other,{limit:10})).resolves.toEqual({items:[expect.objectContaining({id:otherPost})],nextCursor:null}) }))
 it('rejects non-liked cursors for liked pages',async()=>tx(async c=>{ const actor=await human(c),social=repo(c); const wrong=encodeCursor({v:1,kind:'for_you',score:0,publishedAt:'2026-09-01T00:00:00.000Z',id:randomUUID()}); await expect(social.listLiked(actor,{limit:10,cursor:wrong})).rejects.toThrow('INVALID_CURSOR') }))
 it('paginates all owned notifications without duplicates at database microsecond precision',async()=>tx(async c=>{ const recipient=await human(c),other=await human(c),humanActor=await human(c),ipActor=await ip(c); const ids=[randomUUID(),randomUUID(),randomUUID()]; await c.query(`INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind,created_at) VALUES($1,$2,$3,'follow','2026-09-01T00:00:00.000100Z'),($4,$2,$3,'follow','2026-09-01T00:00:00.000900Z'),($5,$2,$6,'follow','2026-09-01T00:00:00.001100Z')`,[ids[0],recipient.id,humanActor.id,ids[1],ids[2],ipActor]); const social=repo(c); const found:string[]=[]; let cursor:string|undefined; do { const page=await social.listNotifications(recipient,{limit:1,...(cursor?{cursor}:{})}); found.push(...page.items.map(item=>item.id)); if (page.items[0]?.id===ids[2]) expect(page.items[0].actor).toMatchObject({kind:'ip',id:ipActor}); if (page.items[0]?.id===ids[1]) expect(page.items[0].actor).toMatchObject({kind:'human',id:humanActor.id}); cursor=page.nextCursor??undefined } while(cursor); expect(found).toEqual([ids[2],ids[1],ids[0]]); expect(new Set(found).size).toBe(ids.length); await expect(social.listNotifications(other,{limit:10})).resolves.toEqual({items:[],nextCursor:null}); await expect(social.listNotifications(recipient,{limit:1,cursor:notificationCursor('2026-09-01T00:00:00.000Z',randomUUID())})).resolves.toEqual({items:[],nextCursor:null}) }))
 it('gets any owner-scoped notification with the shared human and IP actor projection',async()=>tx(async c=>{ const recipient=await human(c),other=await human(c),humanActor=await human(c),ipActor=await ip(c); const humanId=randomUUID(),ipId=randomUUID(); await c.query(`INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind,post_id,comment_id,created_at) VALUES($1,$2,$3,'comment',NULL,NULL,'2026-09-01T00:00:00.000100Z'),($4,$2,$5,'follow',NULL,NULL,'2026-09-01T00:00:00.000900Z')`,[humanId,recipient.id,humanActor.id,ipId,ipActor]); const noise=Array.from({length:52},()=>randomUUID()); await c.query(`INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind,created_at) SELECT id,$2,$3,'follow','2026-09-02T00:00:00Z'::timestamptz+ordinality*interval '1 microsecond' FROM unnest($1::uuid[]) WITH ORDINALITY AS generated(id,ordinality)`,[noise,recipient.id,humanActor.id]); const social=repo(c); const ownedHuman=await social.getNotification(recipient,humanId); const ownedIp=await social.getNotification(recipient,ipId); expect(ownedHuman).toMatchObject({id:humanId,kind:'comment',actor:{kind:'human',id:humanActor.id},postId:null,commentId:null,readAt:null}); expect(ownedIp).toMatchObject({id:ipId,kind:'follow',actor:{kind:'ip',id:ipActor}}); await expect(social.getNotification(other,humanId)).resolves.toBeNull(); await expect(social.getNotification(recipient,randomUUID())).resolves.toBeNull() }))
 it('normalizes malformed notification cursors to INVALID_CURSOR',async()=>tx(async c=>{ const recipient=await human(c),social=repo(c); const invalid=Buffer.from(JSON.stringify({v:1,kind:'notifications',createdAt:'2026-09-01T00:00:00.000Z',id:randomUUID(),extra:true}),'utf8').toString('base64url'); await expect(social.listNotifications(recipient,{limit:1,cursor:invalid})).rejects.toThrow('INVALID_CURSOR') }))
 it('marks an owned notification read safely under concurrent idempotent calls',async()=>tx(async c=>{ const recipient=await human(c),other=await human(c),actor=await human(c),id=randomUUID(); await c.query(`INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind) VALUES($1,$2,$3,'follow')`,[id,recipient.id,actor.id]); const social=repo(c); const [first,second]=await Promise.all([social.markNotificationRead(recipient,id),social.markNotificationRead(recipient,id)]); expect(first?.readAt).toBeTruthy(); expect(second).toEqual(first); await expect(social.markNotificationRead(other,id)).resolves.toBeNull() }))
 it('writes correlated event and outbox atomically through the bounded command',async()=>tx(async c=>{ const actor=await human(c),author=await ip(c),postId=await post(c,author),social=repo(c),command=context(); await expect(social.likePost(actor,postId,command)).resolves.toEqual({created:true}); const result=await c.query(`SELECT e.id,e.request_id,e.environment,o.business_event_id,o.payload FROM public.business_events e JOIN public.analytics_outbox o ON o.business_event_id=e.id WHERE e.event_name='post_liked' AND e.actor_profile_id=$1 AND e.subject_entity_id=$2`,[actor.id,postId]); expect(result.rows).toHaveLength(1); expect(result.rows[0]).toMatchObject({request_id:command.requestId,environment:'api',business_event_id:result.rows[0]?.id,payload:{event_id:result.rows[0]?.id,event_name:'post_liked',event_version:1,request_id:command.requestId}}) }))
 it('rolls back the like, history event, and notification when outbox insertion fails',async()=>tx(async c=>{ const actor=await human(c),author=await ip(c),postId=await post(c,author); const social=repo(c); await c.query(`CREATE FUNCTION pg_temp.reject_social_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced outbox failure'; END $$`); await c.query(`CREATE TRIGGER reject_social_outbox BEFORE INSERT ON public.analytics_outbox FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_social_outbox()`); await expect(social.likePost(actor,postId,context())).rejects.toThrow('forced outbox failure'); await expect(c.query('SELECT 1 FROM public.post_likes WHERE post_id=$1 AND profile_id=$2',[postId,actor.id])).resolves.toMatchObject({rowCount:0}); await expect(c.query("SELECT 1 FROM public.business_events WHERE actor_profile_id=$1 AND subject_entity_id=$2 AND event_name='post_liked'",[actor.id,postId])).resolves.toMatchObject({rowCount:0}); await expect(c.query("SELECT 1 FROM public.notifications WHERE recipient_profile_id=$1 AND actor_profile_id=$2 AND post_id=$3 AND kind='post_like'",[author,actor.id,postId])).resolves.toMatchObject({rowCount:0}) }))
})
