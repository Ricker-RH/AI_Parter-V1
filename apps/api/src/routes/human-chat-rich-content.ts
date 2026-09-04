import {HumanShareTargetQuerySchema,HumanShareTargetSchema,HumanShareTargetPageSchema,HumanShareResolutionSchema} from '@aifans/contracts'
import type {Actor} from '@aifans/db'
import {z} from 'zod'
import type {Context,Hono} from 'hono'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ProfilePort} from '../ports/profiles.js'
import type {HumanChatRichContentPort} from '../ports/human-chat-rich-content.js'
import {apiError} from '../errors.js'
import {strictQuery} from './strict-input.js'
type C=Context<{Variables:ApiVariables}>
type Dependencies={auth?:AuthVerifier;profiles?:ProfilePort;humanChatRichContent?:HumanChatRichContentPort}
const query=HumanShareTargetQuerySchema.extend({limit:z.string().regex(/^(?:[1-9]|1[0-9]|20)$/).transform(Number).default(10)})
const empty=z.strictObject({})
async function actor(c:C,d:Dependencies):Promise<Actor|Response>{
 if(!d.auth)return apiError(c,503,'AUTH_NOT_CONFIGURED','Authentication is not configured')
 const auth=await d.auth.verify(c.req.raw)
 if(auth.status!=='authenticated')return apiError(c,401,'UNAUTHORIZED','Authentication is required')
 if(!d.profiles||!d.humanChatRichContent)return apiError(c,503,'HUMAN_CHAT_NOT_CONFIGURED','Human chat is not configured')
 const current={subject:auth.identity.subject},account=await d.profiles.getCurrentAccount(current)
 if(!account||account.kind!=='human')return apiError(c,403,'HUMAN_ACCOUNT_REQUIRED','A human account is required')
 return current
}
function failure(c:C,error:unknown){
 const code=(error as {code?:string})?.code
 if(code==='22023')return apiError(c,400,'INVALID_REQUEST','Request is invalid')
 if(code==='42501')return apiError(c,403,'HUMAN_ACCOUNT_REQUIRED','A human account is required')
 return apiError(c,500,'INTERNAL_ERROR','Internal server error')
}
export function registerHumanChatRichContentRoutes(app:Hono<{Variables:ApiVariables}>,d:Dependencies){
 app.use('/v1/human-chat/share-targets*',async(c,next)=>{c.header('Cache-Control','private, no-store');await next()})
 app.get('/v1/human-chat/share-targets',async c=>{
  try{const current=await actor(c,d);if(current instanceof Response)return current
   const value=strictQuery(c,query);if(!value)return apiError(c,400,'INVALID_REQUEST','Request is invalid')
   return c.json(HumanShareTargetPageSchema.parse(await d.humanChatRichContent!.listTargets(current,value)))
  }catch(e){return failure(c,e)}
 })
 app.get('/v1/human-chat/share-targets/:kind/:id',async c=>{
  try{const current=await actor(c,d);if(current instanceof Response)return current
   const value=HumanShareTargetSchema.safeParse({kind:c.req.param('kind'),id:c.req.param('id')})
   if(!value.success||!strictQuery(c,empty))return apiError(c,400,'INVALID_REQUEST','Request is invalid')
   return c.json(HumanShareResolutionSchema.parse(await d.humanChatRichContent!.resolveTarget(current,value.data)))
  }catch(e){return failure(c,e)}
 })
}
