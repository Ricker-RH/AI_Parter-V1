import {HumanMediaUploadInputSchema,HumanMediaAttachmentSchema,HumanMediaUploadSchema,HumanMediaDownloadSchema} from '@aifans/contracts'
import type {Actor} from '@aifans/db'
import type {Hono,Context} from 'hono'
import {z} from 'zod'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ProfilePort} from '../ports/profiles.js'
import type {HumanChatMediaPort} from '../ports/human-chat-media.js'
import {strictJsonBody,strictQuery} from './strict-input.js'
type Dependencies={auth?:AuthVerifier;profiles?:ProfilePort;humanChatMedia?:HumanChatMediaPort}
type C=Context<{Variables:ApiVariables}>
const empty=z.strictObject({}),uuid=z.uuid()
function failure(c:C,error:unknown){
 const e=error as {code?:string;message?:string}
 if(e.code==='PDM01')return apiError(c,403,'HUMAN_CHAT_BLOCKED','Messaging is unavailable because of a block')
 if(e.code==='PDM02')return apiError(c,403,'HUMAN_CHAT_MUTUAL_FOLLOW_REQUIRED','Mutual following is required')
 if(e.code==='P0002'||e.code==='42501')return apiError(c,404,'HUMAN_CHAT_NOT_FOUND','Attachment was not found')
 if(e.code==='22023'||e.code==='23514'||e.message==='HUMAN_MEDIA_INVALID')return apiError(c,422,'HUMAN_MEDIA_INVALID','Attachment is invalid or unavailable')
 if(e.message==='HUMAN_MEDIA_STORAGE_UNAVAILABLE')return apiError(c,503,'HUMAN_MEDIA_STORAGE_UNAVAILABLE','Attachment storage is unavailable')
 return apiError(c,500,'INTERNAL_ERROR','Internal server error')
}
async function actor(c:C,d:Dependencies):Promise<Actor|Response>{
 if(!d.auth)return apiError(c,503,'AUTH_NOT_CONFIGURED','Authentication is not configured')
 const auth=await d.auth.verify(c.req.raw)
 if(auth.status!=='authenticated')return apiError(c,401,'UNAUTHORIZED','Authentication is required')
 if(!d.profiles||!d.humanChatMedia)return apiError(c,503,'HUMAN_MEDIA_NOT_CONFIGURED','Attachment storage is not configured')
 const current={subject:auth.identity.subject},account=await d.profiles.getCurrentAccount(current)
 if(!account||account.kind!=='human')return apiError(c,403,'HUMAN_ACCOUNT_REQUIRED','A human account is required')
 return current
}
export function registerHumanChatMediaRoutes(app:Hono<{Variables:ApiVariables}>,d:Dependencies){
 app.use('/v1/human-chat/*',async(c,next)=>{c.header('Cache-Control','private, no-store');await next()})
 app.post('/v1/human-chat/peers/:peerProfileId/attachments',async c=>{
  try{
   const current=await actor(c,d);if(current instanceof Response)return current
   const peer=uuid.safeParse(c.req.param('peerProfileId')),input=await strictJsonBody(c,HumanMediaUploadInputSchema)
   if(!peer.success||!input||!strictQuery(c,empty))return apiError(c,400,'INVALID_REQUEST','Request is invalid')
   return c.json(HumanMediaUploadSchema.parse(await d.humanChatMedia!.reserve(current,peer.data,input)))
  }catch(e){return failure(c,e)}
 })
 app.post('/v1/human-chat/attachments/:attachmentId/finalize',async c=>{
  try{
   const current=await actor(c,d);if(current instanceof Response)return current
   const id=uuid.safeParse(c.req.param('attachmentId')),input=await strictJsonBody(c,empty)
   if(!id.success||!input||!strictQuery(c,empty))return apiError(c,400,'INVALID_REQUEST','Request is invalid')
   return c.json(HumanMediaAttachmentSchema.parse(await d.humanChatMedia!.finalize(current,id.data)))
  }catch(e){return failure(c,e)}
 })
 app.get('/v1/human-chat/attachments/:attachmentId/download',async c=>{
  try{
   const current=await actor(c,d);if(current instanceof Response)return current
   const id=uuid.safeParse(c.req.param('attachmentId'))
   if(!id.success||!strictQuery(c,empty))return apiError(c,400,'INVALID_REQUEST','Request is invalid')
   return c.json(HumanMediaDownloadSchema.parse(await d.humanChatMedia!.download(current,id.data)))
  }catch(e){return failure(c,e)}
 })
}
