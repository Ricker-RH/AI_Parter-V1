import {z} from 'zod'
import type {Hono} from 'hono'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ProfilePort} from '../ports/profiles.js'
import {apiError} from '../errors.js'
import {strictJsonBody, strictQuery} from './strict-input.js'
export const InboxPreferenceInput = z.strictObject({kind:z.enum(['HUMAN','IP']),conversationId:z.uuid(),action:z.enum(['pin','unpin','delete'])})
export type InboxPreferencesPort = {
 list(actor:{subject:string}):Promise<{items:Array<{kind:'HUMAN'|'IP';conversationId:string;pinnedAt:string|null;deletedAt:string|null}>}>
 mutate(actor:{subject:string},input:z.infer<typeof InboxPreferenceInput>):Promise<void>
}
export function registerInboxPreferencesRoutes(app:Hono<{Variables:ApiVariables}>,dependencies:{auth?:AuthVerifier;profiles?:ProfilePort;inboxPreferences?:InboxPreferencesPort}) {
 app.on(['GET','POST'],'/v1/inbox/preferences',async c=>{
  c.header('Cache-Control','private, no-store')
  if(!dependencies.auth||!dependencies.profiles||!dependencies.inboxPreferences)return apiError(c,503,'NOT_CONFIGURED','Inbox preferences unavailable')
  const auth=await dependencies.auth.verify(c.req.raw)
  if(auth.status!=='authenticated')return apiError(c,401,'UNAUTHORIZED','Authentication required')
  const actor={subject:auth.identity.subject}
  try {
   const account=await dependencies.profiles.getCurrentAccount(actor)
   if(!account||account.kind!=='human')return apiError(c,403,'HUMAN_ACCOUNT_REQUIRED','Human account required')
   if(!strictQuery(c,z.strictObject({})))return apiError(c,400,'INVALID_REQUEST','Invalid request')
   if(c.req.method==='GET')return c.json(await dependencies.inboxPreferences.list(actor))
   const input=await strictJsonBody(c,InboxPreferenceInput)
   if(!input)return apiError(c,400,'INVALID_REQUEST','Invalid request')
   await dependencies.inboxPreferences.mutate(actor,input)
   return c.json({ok:true})
  }catch(error){
   const code=(error as {code?:string}).code
   return code==='42501'||code==='P0002'?apiError(c,404,'NOT_FOUND','Conversation not found'):apiError(c,500,'INTERNAL_ERROR','Inbox operation failed')
  }
 })
}
