import {randomUUID} from 'node:crypto'
import {HumanRealtimeEventSchema} from '@aifans/contracts'
import {z} from 'zod'
const identity={subject:z.string().min(1).max(512),profileId:z.uuid(),sessionId:z.uuid(),conversationId:z.uuid()}
export const EphemeralInputSchema=z.discriminatedUnion('type',[
 z.strictObject({...identity,type:z.literal('typing'),isTyping:z.boolean()}),
 z.strictObject({...identity,type:z.literal('presence'),status:z.enum(['online','offline']),snapshot:z.boolean().optional()}),
])
export const EphemeralOutputSchema=z.strictObject({deliveries:z.array(z.strictObject({recipientProfileId:z.uuid(),event:HumanRealtimeEventSchema})).max(2)})
export type EphemeralInput=z.infer<typeof EphemeralInputSchema>
export type EphemeralResolverInput={subject:string;profileId:string;sessionId:string;conversationId:string;allowExpired:boolean}
export function createRealtimeEphemeral(options:{resolve(input:EphemeralResolverInput):Promise<string|null>;status(profileId:string,conversationId:string):Promise<boolean>}) {
 return {async emit(raw:EphemeralInput):Promise<z.infer<typeof EphemeralOutputSchema>> {
   const input=EphemeralInputSchema.parse(raw)
   const peer=await options.resolve({...input,allowExpired:input.type==='presence'&&input.status==='offline'})
   if(!peer) return {deliveries:[]}
   const base={v:1 as const,eventId:randomUUID(),occurredAt:new Date().toISOString(),conversationId:input.conversationId,profileId:input.profileId}
   const event=input.type==='typing'?{...base,type:'typing' as const,isTyping:input.isTyping}:{...base,type:'presence' as const,status:input.status}
   const deliveries:z.infer<typeof EphemeralOutputSchema>['deliveries']=[{recipientProfileId:peer,event}]
   if(input.type==='presence'&&input.status==='online'&&input.snapshot) {
     const online=await options.status(peer,input.conversationId)
     deliveries.push({recipientProfileId:input.profileId,event:{...base,eventId:randomUUID(),profileId:peer,type:'presence',status:online?'online':'offline'}})
   }
   return EphemeralOutputSchema.parse({deliveries})
 }}
}
export type RealtimeEphemeralPort=ReturnType<typeof createRealtimeEphemeral>
