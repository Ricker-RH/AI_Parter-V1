import {z} from 'zod'
import type {WithPlatformActor} from './session.js'
const schema=z.object({sessionId:z.uuid(),subject:z.string().min(1).max(512),profileId:z.uuid(),conversationId:z.uuid(),allowExpired:z.boolean()})
export function createPostgresRealtimeEphemeralRepository({withPlatformActor}:{withPlatformActor:WithPlatformActor}) {
 return {async resolve(input:z.infer<typeof schema>):Promise<string|null> {
   const parsed=schema.safeParse(input);if(!parsed.success)return null
   const v=parsed.data
   return withPlatformActor({subject:'__realtime_service__'},async client=>{
     const result=await client.query('SELECT public.realtime_ephemeral_recipient($1,$2,$3,$4,$5) AS peer_id',[v.sessionId,v.subject,v.profileId,v.conversationId,v.allowExpired])
     const peer=z.uuid().safeParse(result.rows[0]?.peer_id);return peer.success?peer.data:null
   })
 }}
}
