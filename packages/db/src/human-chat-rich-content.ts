import {HumanShareTargetQuerySchema,HumanShareTargetSchema,HumanShareTargetPageSchema,HumanShareRecipientPageSchema,HumanShareResolutionSchema,type HumanShareTargetQuery,type HumanShareTarget} from '@aifans/contracts'
import {z} from 'zod'
import type {Actor,WithActor} from './session.js'
const RecipientRow=z.strictObject({id:z.uuid(),displayName:z.string().min(1).max(160),avatarKey:z.string().nullable()})
export function createHumanChatRichContentRepository({withActor,publicMediaBaseUrl}:{withActor:WithActor;publicMediaBaseUrl?:string}){
 let base:URL|undefined
 if(publicMediaBaseUrl){base=new URL(publicMediaBaseUrl);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new Error('INVALID_PUBLIC_MEDIA_BASE_URL');if(!base.pathname.endsWith('/'))base.pathname+='/' }
 function avatarUrl(key:string|null,id:string){
  if(key===null)return null
  if(!new RegExp(`^public/profiles/${id}/avatar/[0-9a-f-]+\\.webp$`).test(key))throw new Error('INVALID_PUBLIC_MEDIA_KEY')
  if(!base)throw new Error('PUBLIC_MEDIA_BASE_URL_REQUIRED')
  return new URL(key,base).toString()
 }
 return {
  async listTargets(actor:Actor,input:HumanShareTargetQuery){
   const value=HumanShareTargetQuerySchema.parse(input)
   return withActor(actor,async c=>HumanShareTargetPageSchema.parse({items:(await c.query('SELECT public.human_dm_share_targets($1,$2,$3) AS card',[value.kind,value.q,value.limit])).rows.map(row=>row.card)}))
  },
  async listShareRecipients(actor:Actor){
   return withActor(actor,async c=>HumanShareRecipientPageSchema.parse({items:(await c.query('SELECT public.human_dm_share_recipients($1) AS recipient',[20])).rows.map(row=>{
    const value=RecipientRow.parse(row.recipient)
    return {id:value.id,displayName:value.displayName,avatarUrl:avatarUrl(value.avatarKey,value.id)}
   })}))
  },
  async resolveTarget(actor:Actor,input:HumanShareTarget){
   const value=HumanShareTargetSchema.parse(input)
   return withActor(actor,async c=>HumanShareResolutionSchema.parse((await c.query('SELECT public.human_dm_resolve_share($1,$2) AS resolution',[value.kind,value.id])).rows[0]?.resolution))
  },
 }
}
export type HumanChatRichContentRepository=ReturnType<typeof createHumanChatRichContentRepository>
