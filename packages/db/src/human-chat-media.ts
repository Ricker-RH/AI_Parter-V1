import {z} from 'zod'
import {HumanMediaUploadInputSchema,type HumanMediaUploadInput,type HumanMediaAttachment} from '@aifans/contracts'
import type {Actor,WithActor,WithPlatformActor} from './session.js'
const uuid=z.uuid()
export type HumanMediaReservation={attachmentId:string;ownerProfileId:string;peerProfileId:string;conversationId:string;kind:'image'|'voice';contentType:HumanMediaUploadInput['contentType'];sizeBytes:number;expiresAt:string;stagingObjectKey:string;finalObjectKey:string;attachment:HumanMediaAttachment|null}
function reservation(row:Record<string,unknown>|undefined):HumanMediaReservation{
 if(!row)throw Object.assign(new Error('HUMAN_CHAT_NOT_FOUND'),{code:'P0002'})
 const id=uuid.parse(row.id),owner=uuid.parse(row.owner_profile_id)
 const kind=z.enum(['image','voice']).parse(row.kind)
 const value=HumanMediaUploadInputSchema.parse({kind,contentType:row.content_type,sizeBytes:row.size_bytes})
 const base=`private/human-chat/${owner}/${id}`
 return {attachmentId:id,ownerProfileId:owner,peerProfileId:uuid.parse(row.peer_profile_id),conversationId:uuid.parse(row.conversation_id),...value,
  expiresAt:row.expires_at instanceof Date?row.expires_at.toISOString():z.iso.datetime().parse(row.expires_at),
  stagingObjectKey:`${base}/staging`,finalObjectKey:`${base}/final`,
  attachment:row.finalized_at?{attachmentId:id,kind,contentType:z.enum(['image/webp','audio/webm','audio/mp4']).parse(row.final_content_type),sizeBytes:z.number().int().positive().max(10485760).parse(row.final_size_bytes),
   ...(row.width==null?{}:{width:z.number().int().positive().parse(row.width)}),...(row.height==null?{}:{height:z.number().int().positive().parse(row.height)}),...(row.duration_ms==null?{}:{durationMs:z.number().int().positive().max(60000).parse(row.duration_ms)})}:null}
}
export function createHumanChatMediaRepository({withActor,withPlatformActor}:{withActor:WithActor;withPlatformActor:WithPlatformActor}){
 return {
  async reserve(actor:Actor,peerProfileId:string,input:HumanMediaUploadInput){
   const peer=uuid.parse(peerProfileId),value=HumanMediaUploadInputSchema.parse(input)
   return withActor(actor,async c=>reservation((await c.query('SELECT * FROM public.human_dm_reserve_attachment($1,$2,$3,$4)',[peer,value.kind,value.contentType,value.sizeBytes])).rows[0]))
  },
  async get(actor:Actor,attachmentId:string,forDownload=false){
   const id=uuid.parse(attachmentId)
   return withActor(actor,async c=>reservation((await c.query('SELECT * FROM public.human_dm_get_attachment($1,$2)',[id,forDownload])).rows[0]))
  },
  async confirm(actor:Actor,attachmentId:string,verified:Omit<HumanMediaAttachment,'attachmentId'|'kind'>){
   const id=uuid.parse(attachmentId)
   return withPlatformActor(actor,async c=>reservation((await c.query('SELECT * FROM public.human_dm_confirm_attachment($1,$2,$3,$4,$5,$6)',[id,verified.contentType,verified.sizeBytes,verified.width??null,verified.height??null,verified.durationMs??null])).rows[0]))
  },
 }
}
export type HumanChatMediaRepository=ReturnType<typeof createHumanChatMediaRepository>
