import {describe,it,expect,vi} from 'vitest'
import {createHumanSocialRepository} from '../src/human-social.js'
import type {QueryClient,WithActor} from '../src/session.js'
const id='edc5b166-125d-4af3-ac8c-233a773f66c0', actor={subject:'real-subject'}
const row={id,username:'someone',display_name:'Someone',bio:'Bio',avatar_object_key:null,background_type:'color',background_color_key:'paper',background_object_key:null,background_focal_x:'0.5',background_focal_y:'0.5',profile_visibility:'private',is_owner:false,following:false,followed_by:false,blocked_by_viewer:false,message_disabled_reason:'authentication_required',tabs_available:false}
function setup(rows:Record<string,unknown>[]=[row],base='https://media.example.test/'){
 const query=vi.fn(async()=>({rows,rowCount:rows.length}));const client={query,release:vi.fn()} as unknown as QueryClient
 const session=vi.fn(async(_actor,cb)=>cb(client)) as WithActor
 const publicSession=vi.fn(async(cb:(c:QueryClient)=>Promise<unknown>)=>cb(client))
 return{query,session,publicSession,repo:createHumanSocialRepository({withActor:session,withPublic:publicSession as never,publicMediaBaseUrl:base})}
}
describe('human social repository',()=>{
 it('projects strict private basic profile under public session without activity metadata',async()=>{
  const {repo,publicSession,query}=setup();const result=await repo.getPublicProfile({viewer:null,profileId:id})
  expect(publicSession).toHaveBeenCalledOnce();expect(query).toHaveBeenCalledWith('SELECT * FROM public.human_public_profile($1)',[id])
  expect(result).toMatchObject({bio:'Bio',background:{type:'color',colorKey:'paper'},tabs:{ips:{state:'locked'},liked:{state:'locked'},saved:{state:'locked'},following:{state:'locked'}}})
 })
 it('uses actor session and rejects malformed database booleans rather than coercing',async()=>{
  const {repo,session}=setup([{...row,tabs_available:'false'}]);await expect(repo.getPublicProfile({viewer:actor,profileId:id})).rejects.toThrow();expect(session).toHaveBeenCalledWith(actor,expect.any(Function))
 })
 it('validates ids before SQL and rejects extra fields',async()=>{const {repo,query}=setup();await expect(repo.getPublicProfile({viewer:null,profileId:'bad'})).rejects.toThrow();await expect(repo.setPreferences(actor,{visibility:'public',profileId:id} as never)).rejects.toThrow();expect(query).not.toHaveBeenCalled()})
 it('sends only the changed preference and preserves omitted values via NULL',async()=>{
  const {repo,query}=setup([{profile_id:id,profile_visibility:'public',show_presence:false}]);expect(await repo.setPreferences(actor,{visibility:'public'})).toEqual({visibility:'public',showPresence:false});expect(query).toHaveBeenCalledWith('SELECT * FROM public.human_set_preferences($1,$2)',['public',null])
 })
 it('routes each relationship command through bounded actor SQL and validates results',async()=>{
  const {repo,query}=setup([{changed:true}]);for(const command of ['follow','unfollow','block','unblock'] as const){expect(await repo[command](actor,id)).toEqual({changed:true});expect(query).toHaveBeenLastCalledWith(`SELECT public.human_${command}_profile($1) AS changed`,[id])}
  await expect(setup([{changed:'false'}]).repo.block(actor,id)).rejects.toThrow()
 })
 it('returns missing profiles as null and refuses unexpected extra database fields',async()=>{expect(await setup([]).repo.getPublicProfile({viewer:null,profileId:id})).toBeNull();await expect(setup([{...row,auth_subject:'secret'}]).repo.getPublicProfile({viewer:null,profileId:id})).rejects.toThrow()})
 it('only builds owned asset URLs under configured HTTPS origin',async()=>{
  const key=`public/profiles/${id}/avatar/${id}.webp`;expect((await setup([{...row,avatar_object_key:key}]).repo.getPublicProfile({viewer:null,profileId:id}))?.identity.avatarUrl).toBe(`https://media.example.test/${key}`)
  for(const key of ['https://evil.test/a','../private','public/profiles/other/avatar/a.webp'])await expect(setup([{...row,avatar_object_key:key}]).repo.getPublicProfile({viewer:null,profileId:id})).rejects.toThrow()
  expect(()=>setup([row],'https://user:pass@media.example.test/')).toThrow()
 })
})
