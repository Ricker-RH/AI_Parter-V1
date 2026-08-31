import {randomUUID} from 'node:crypto'
import {Pool, type PoolClient} from 'pg'
import {afterAll, describe, expect, it} from 'vitest'
import {decodeCursor} from '@aifans/contracts'
import {createSocialRepository} from '../src/social.js'
import {createActorSession} from '../src/session.js'

const connectionString=process.env.DATABASE_URL ?? ''
const integration=connectionString ? describe : describe.skip
const pool=new Pool({connectionString})
async function tx<T>(fn:(c:PoolClient)=>Promise<T>) { const c=await pool.connect(); try { await c.query('BEGIN'); return await fn(c) } finally { await c.query('ROLLBACK').catch(()=>undefined); c.release() } }
async function human(c:PoolClient) { const id=randomUUID(), subject=`fixture-${randomUUID()}`; await c.query(`INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'Human')`,[id,subject,`h_${id.replaceAll('-','').slice(0,20)}`]); return {id,subject} }
async function ip(c:PoolClient, state:'published'|'draft'='published') { const id=randomUUID(), revision=randomUUID(); await c.query(`INSERT INTO public.profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'IP')`,[id,`i_${id.replaceAll('-','').slice(0,20)}`]); await c.query(`INSERT INTO public.ip_profiles(profile_id,source,public_state,operation_enabled,current_identity_revision_id) VALUES($1,'platform',$2,true,$3)`,[id,state,revision]); await c.query(`INSERT INTO public.ip_identity_revisions(id,ip_profile_id,version,display_name,languages) VALUES($1,$2,1,'IP',ARRAY['en'])`,[revision,id]); return id }
async function post(c:PoolClient, author:string, state:'published'|'draft'|'withdrawn'='published') { const id=randomUUID(); const dates=state==='published' ? `,published_at=clock_timestamp()` : state==='withdrawn' ? `,published_at=clock_timestamp(),withdrawn_at=clock_timestamp()` : ''; await c.query(`INSERT INTO public.posts(id,author_profile_id,source,state,body${state==='published'?' ,published_at':''}${state==='withdrawn'?' ,published_at,withdrawn_at':''}) VALUES($1,$2,'worker',$3,'fixture'${state==='published'?',clock_timestamp()':''}${state==='withdrawn'?',clock_timestamp(),clock_timestamp()':''})`,[id,author,state]); return id }
function repo(c:PoolClient) { const session=createActorSession({connect:async()=>({query:c.query.bind(c),release(){}})}); return createSocialRepository({withActor:session.withActor,withPublic:async(fn)=>{await c.query('SAVEPOINT anon'); try {await c.query('SET LOCAL ROLE aifans_anon'); await c.query("SELECT set_config('request.jwt.claims','{}',true)"); const value=await fn({query:c.query.bind(c),release(){}}); await c.query('ROLLBACK TO SAVEPOINT anon'); return value} finally {await c.query('RELEASE SAVEPOINT anon').catch(()=>undefined)}}}) }

integration('social repository local postgres',()=>{
 afterAll(async()=>pool.end())
 it('returns only published public posts and keeps viewer flags actor-scoped',async()=>tx(async c=>{
  const author=await ip(c); const hidden=await ip(c,'draft'); const visible=await post(c,author); await post(c,hidden); await post(c,author,'withdrawn');
  const first=await human(c), second=await human(c); const social=repo(c);
  const ownerProjection=await c.query('SELECT post_id FROM public.social_public_posts()'); expect(ownerProjection.rows.map((row)=>row.post_id)).toContain(visible);
  await c.query('SAVEPOINT diagnostic_anon'); await c.query('SET LOCAL ROLE aifans_anon'); const anonProjection=await c.query('SELECT post_id FROM public.social_public_posts()'); const flags=await c.query('SELECT * FROM public.social_viewer_flags($1,$2)',[visible,author]); const metrics=await c.query('SELECT * FROM public.social_post_metrics($1,$2,$3)',[visible,author,'en']); const identity=await c.query("SELECT current_user, current_setting('request.jwt.claims',true) AS claims"); await c.query('ROLLBACK TO SAVEPOINT diagnostic_anon'); await c.query('RELEASE SAVEPOINT diagnostic_anon'); expect(identity.rows[0]?.current_user).toBe('aifans_anon'); expect(anonProjection.rows.map((row)=>row.post_id)).toContain(visible); expect(flags.rows).toHaveLength(1); expect(metrics.rows).toHaveLength(1);
  await social.likePost(first,visible); await social.bookmarkPost(first,visible); await social.follow(first,author);
  const anon=await social.listFeed({viewer:null,kind:'for_you',limit:25,after:null}); expect(anon.items.map(x=>x.id)).toEqual([visible]); expect(anon.items[0]?.likeCount).toBe(1); expect(anon.items[0]?.viewerHasLiked).toBe(false);
  const mine=await social.listFeed({viewer:first,kind:'for_you',limit:25,after:null}); expect(mine.items[0]).toMatchObject({viewerHasLiked:true,viewerHasBookmarked:true,viewerFollowsAuthor:true});
  const other=await social.listFeed({viewer:second,kind:'for_you',limit:25,after:null}); expect(other.items[0]).toMatchObject({viewerHasLiked:false,viewerHasBookmarked:false,viewerFollowsAuthor:false});
 }))
 it('uses feed cursor without duplicates',async()=>tx(async c=>{ const author=await ip(c); await post(c,author); await post(c,author); const social=repo(c); const one=await social.listFeed({viewer:null,kind:'for_you',limit:1,after:null}); const two=await social.listFeed({viewer:null,kind:'for_you',limit:1,after:decodeCursor(one.nextCursor!,'for_you')}); expect(one.items[0]?.id).not.toBe(two.items[0]?.id) }))
 it('rejects comments on hidden posts and follows of non-public IPs',async()=>tx(async c=>{ const actor=await human(c); const author=await ip(c); const draft=await post(c,author,'draft'); const withdrawn=await post(c,author,'withdrawn'); const hidden=await ip(c,'draft'); const social=repo(c); await expect(social.createHumanComment(actor,draft,{body:'no'})).rejects.toThrow(); await expect(social.createHumanComment(actor,withdrawn,{body:'no'})).rejects.toThrow(); await expect(social.follow(actor,hidden)).rejects.toThrow() }))
})
