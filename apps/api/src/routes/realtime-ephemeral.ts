import {createHash,timingSafeEqual} from 'node:crypto'
import type {Hono} from 'hono'
import {z} from 'zod'
import type {ApiVariables} from '../middleware/request-id.js'
import {apiError} from '../errors.js'
import {EphemeralInputSchema,EphemeralOutputSchema,type RealtimeEphemeralPort} from '../ports/realtime-ephemeral.js'
import {strictJsonBody,strictQuery} from './strict-input.js'
export function registerRealtimeEphemeralRoutes(app:Hono<{Variables:ApiVariables}>,dependencies:{realtimeEphemeral?:RealtimeEphemeralPort;realtimeInternalSecret?:string}) {
 app.post('/v1/internal/realtime/ephemeral',async c=>{
  c.header('Cache-Control','private, no-store')
  try {
   const secret=dependencies.realtimeInternalSecret
   if(!dependencies.realtimeEphemeral || !secret || secret.trim()!==secret || Buffer.byteLength(secret)<32) return apiError(c,503,'REALTIME_NOT_CONFIGURED','Realtime is not configured')
   const digest=(value:string)=>createHash('sha256').update(value).digest()
   if(!timingSafeEqual(digest(c.req.header('authorization')??''),digest(`Bearer ${secret}`))) return apiError(c,401,'UNAUTHORIZED','Unauthorized')
   if(!strictQuery(c,z.strictObject({}))) return apiError(c,422,'INVALID_REQUEST','Request is invalid')
   const input=await strictJsonBody(c,EphemeralInputSchema)
   if(!input) return apiError(c,422,'INVALID_REQUEST','Request is invalid')
   return c.json(EphemeralOutputSchema.parse(await dependencies.realtimeEphemeral.emit(input)))
  } catch {return apiError(c,500,'INTERNAL_ERROR','Internal server error')}
 })
}
