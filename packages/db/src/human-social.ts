import {HumanProfileSchema,HumanPreferencesUpdateInputSchema,HumanVisibilitySchema,HumanMessageDisabledReasonSchema,type HumanProfile,type HumanPreferencesUpdateInput} from '@aifans/contracts'
import {z} from 'zod'
import type {Actor,QueryClient,WithActor} from './session.js'
import {HumanRelationshipBatchInputSchema,HumanRelationshipBatchSchema} from '@aifans/contracts'

type WithPublic=<T>(callback:(client:QueryClient)=>Promise<T>)=>Promise<T>
const uuid=z.uuid()
const ProfileRow=z.strictObject({
 id:uuid,username:z.string(),display_name:z.string(),bio:z.string().max(500).nullable(),avatar_object_key:z.string().nullable(),
 background_type:z.enum(['color','image']),background_color_key:z.string(),background_object_key:z.string().nullable(),
 background_focal_x:z.union([z.string().regex(/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/),z.number().min(0).max(1)]),
 background_focal_y:z.union([z.string().regex(/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/),z.number().min(0).max(1)]),
 profile_visibility:HumanVisibilitySchema,is_owner:z.boolean(),following:z.boolean(),followed_by:z.boolean(),blocked_by_viewer:z.boolean(),
 message_disabled_reason:HumanMessageDisabledReasonSchema.nullable(),tabs_available:z.boolean(),
})
const PreferencesRow=z.strictObject({profile_id:uuid,profile_visibility:HumanVisibilitySchema,show_presence:z.boolean()})
const ChangedRow=z.strictObject({changed:z.boolean()})

export function createHumanSocialRepository({withActor,withPublic,publicMediaBaseUrl}:{withActor:WithActor;withPublic:WithPublic;publicMediaBaseUrl?:string}){
 let base:URL|undefined
 if(publicMediaBaseUrl){base=new URL(publicMediaBaseUrl);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new Error('INVALID_PUBLIC_MEDIA_BASE_URL');if(!base.pathname.endsWith('/'))base.pathname+='/' }
 function media(key:string|null,profileId:string,role:'avatar'|'background'){
  if(key===null)return null
  if(!new RegExp(`^public/profiles/${profileId}/${role}/[0-9a-f-]+\\.webp$`).test(key))throw new Error('INVALID_PUBLIC_MEDIA_KEY')
  if(!base)throw new Error('PUBLIC_MEDIA_BASE_URL_REQUIRED')
  return new URL(key,base).toString()
 }
 async function command(actor:Actor,targetProfileId:string,name:'follow'|'unfollow'|'block'|'unblock'){
  const target=uuid.parse(targetProfileId)
  return withActor(actor,async client=>ChangedRow.parse((await client.query(`SELECT public.human_${name}_profile($1) AS changed`,[target])).rows[0]))
 }
 return{
  async getRelationships(actor:Actor,profileIds:string[]){
   const input=HumanRelationshipBatchInputSchema.parse({profileIds})
   return withActor(actor,async client=>{
    const result=await client.query(`SELECT p.id AS profile_id,p.is_owner,p.following,p.followed_by,
      (p.blocked_by_viewer OR coalesce(p.message_disabled_reason='blocked',false)) AS blocked
      FROM unnest($1::uuid[]) AS requested(id)
      CROSS JOIN LATERAL public.human_public_profile(requested.id) p`,[input.profileIds])
    return HumanRelationshipBatchSchema.parse({items:result.rows.map(r=>({profileId:r.profile_id,isOwner:r.is_owner,following:r.following,followedBy:r.followed_by,blocked:r.blocked}))})
   })
  },
  async getPreferences(actor:Actor){
   return withActor(actor,async client=>{
    const result=await client.query("SELECT me.id AS profile_id,coalesce(p.profile_visibility,'private') AS profile_visibility,coalesce(p.show_presence,false) AS show_presence FROM (SELECT public.social_current_human_profile_id() AS id) me LEFT JOIN public.human_social_preferences p ON p.profile_id=me.id WHERE me.id IS NOT NULL")
    if(!result.rows[0])throw Object.assign(new Error('HUMAN_ACCOUNT_REQUIRED'),{code:'42501'})
    const r=PreferencesRow.parse(result.rows[0]);return{visibility:r.profile_visibility,showPresence:r.show_presence}
   })
  },
  async getPublicProfile({viewer,profileId}:{viewer:Actor|null;profileId:string}):Promise<HumanProfile|null>{
   const target=uuid.parse(profileId)
   const read=async(client:QueryClient)=>{
    const result=await client.query('SELECT * FROM public.human_public_profile($1)',[target]);if(!result.rows[0])return null
    const r=ProfileRow.parse(result.rows[0]);const tab={state:r.tabs_available?'available':'locked'}
    return HumanProfileSchema.parse({v:1,identity:{kind:'HUMAN',id:r.id,username:r.username,displayName:r.display_name,avatarUrl:media(r.avatar_object_key,r.id,'avatar')},bio:r.bio,
     background:r.background_type==='color'?{type:'color',colorKey:r.background_color_key}:{type:'image',url:media(r.background_object_key,r.id,'background'),focalX:Number(r.background_focal_x),focalY:Number(r.background_focal_y)},
     visibility:r.profile_visibility,isOwner:r.is_owner,relationship:{following:r.following,followedBy:r.followed_by,blockedByViewer:r.blocked_by_viewer,canMessage:r.message_disabled_reason===null,messageDisabledReason:r.message_disabled_reason},tabs:{ips:tab,liked:tab,saved:tab,following:tab}})
   }
   return viewer?withActor(viewer,read):withPublic(read)
  },
  async setPreferences(actor:Actor,input:HumanPreferencesUpdateInput){
   const value=HumanPreferencesUpdateInputSchema.parse(input)
   return withActor(actor,async client=>{const r=PreferencesRow.parse((await client.query('SELECT * FROM public.human_set_preferences($1,$2)',[value.visibility??null,value.showPresence??null])).rows[0]);return{visibility:r.profile_visibility,showPresence:r.show_presence}})
  },
  follow:(actor:Actor,targetProfileId:string)=>command(actor,targetProfileId,'follow'),
  unfollow:(actor:Actor,targetProfileId:string)=>command(actor,targetProfileId,'unfollow'),
  block:(actor:Actor,targetProfileId:string)=>command(actor,targetProfileId,'block'),
  unblock:(actor:Actor,targetProfileId:string)=>command(actor,targetProfileId,'unblock'),
 }
}
export type HumanSocialRepository=ReturnType<typeof createHumanSocialRepository>
