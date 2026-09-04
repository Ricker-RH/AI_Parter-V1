import type {Hono} from 'hono'
import {z} from 'zod'
import type {ApiVariables} from '../middleware/request-id.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ProfilePort} from '../ports/profiles.js'
import type {RealtimeRevocationPort} from '../ports/realtime-revocation.js'
import {apiError} from '../errors.js'
import {strictJsonBody,strictQuery} from './strict-input.js'
const empty=z.strictObject({}),output=z.strictObject({revoked:z.number().int().nonnegative().max(2147483647)})
export function registerRealtimeRevocationRoutes(app:Hono<{Variables:ApiVariables}>,dependencies:{auth?:AuthVerifier;profiles?:ProfilePort;realtimeRevocation?:RealtimeRevocationPort;realtimeRevocationEnabled?:boolean}){
 app.post('/v1/realtime/revoke',async c=>{
  c.header('Cache-Control','private, no-store')
  try{
   if(!dependencies.auth)return apiError(c,503,'AUTH_NOT_CONFIGURED','Authentication is not configured')
   const auth=await dependencies.auth.verify(c.req.raw)
   if(auth.status!=='authenticated')return apiError(c,401,'UNAUTHORIZED','Authentication is required')
   if(!strictQuery(c,empty)||!await strictJsonBody(c,empty))return apiError(c,422,'INVALID_REQUEST','Request is invalid')
   if(!dependencies.profiles)return apiError(c,503,'REALTIME_REVOCATION_UNAVAILABLE','Sign out is temporarily unavailable')
   const actor={subject:auth.identity.subject},profile=await dependencies.profiles.getCurrentAccount(actor)
   // Such accounts cannot own human realtime sessions, but must retain logout.
   // A failed lookup throws and remains fail-closed below; it is not absence.
   if(!profile||profile.kind!=='human')return c.json({revoked:0})
   // Explicitly disabled rollout has no realtime session migration dependency.
   if(dependencies.realtimeRevocationEnabled===false)return c.json({revoked:0})
   if(!dependencies.realtimeRevocation||dependencies.realtimeRevocationEnabled!==true)return apiError(c,503,'REALTIME_REVOCATION_UNAVAILABLE','Sign out is temporarily unavailable')
   return c.json(output.parse({revoked:await dependencies.realtimeRevocation.revokeOwn(actor)}))
  }catch{return apiError(c,503,'REALTIME_REVOCATION_UNAVAILABLE','Sign out is temporarily unavailable')}
 })
}
