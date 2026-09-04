import {HumanProfileTabKeySchema,HumanProfileTabPageSchema} from '@aifans/contracts'
import type {Hono} from 'hono'
import {z} from 'zod'
import {apiError} from '../errors.js'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {HumanProfileTabsPort} from '../ports/human-profile-tabs.js'
import {strictQuery} from './strict-input.js'
const query=z.strictObject({limit:z.string().regex(/^[1-9][0-9]?$/).transform(Number).pipe(z.number().max(50)).optional().default(20),cursor:z.string().min(1).max(1024).optional()})
export function registerHumanProfileTabsRoutes(app:Hono<{Variables:ApiVariables}>,dependencies:{auth?:AuthVerifier;humanProfileTabs?:HumanProfileTabsPort}){
 app.get('/v1/humans/:profileId/tabs/:tab',async c=>{
  c.header('Cache-Control','private, no-store')
  try{
   if(!dependencies.auth&&c.req.header('authorization')!==undefined)return apiError(c,503,'HUMAN_SOCIAL_NOT_CONFIGURED','Human social is not configured')
   const auth=dependencies.auth?await dependencies.auth.verify(c.req.raw):{status:'missing' as const}
   if(auth.status==='invalid')return apiError(c,401,'UNAUTHORIZED','Authentication is required')
   const id=z.uuid().safeParse(c.req.param('profileId')),tab=HumanProfileTabKeySchema.safeParse(c.req.param('tab')),input=strictQuery(c,query)
   if(!id.success||!tab.success||!input)return apiError(c,400,'INVALID_REQUEST','Request is invalid')
   if(!dependencies.humanProfileTabs)return apiError(c,503,'HUMAN_SOCIAL_NOT_CONFIGURED','Human social is not configured')
   const result=await dependencies.humanProfileTabs.getTab({viewer:auth.status==='authenticated'?{subject:auth.identity.subject}:null,profileId:id.data,tab:tab.data,limit:input.limit,...(input.cursor?{cursor:input.cursor}:{})})
   return result?c.json(HumanProfileTabPageSchema.parse(result)):apiError(c,404,'HUMAN_PROFILE_NOT_FOUND','Human profile was not found')
  }catch(error){
   const code=typeof error==='object'&&error!==null&&'code'in error?error.code:undefined
   if(code==='22023')return apiError(c,400,'INVALID_REQUEST','Request is invalid')
   return apiError(c,500,'INTERNAL_ERROR','Internal server error')
  }
 })
}
