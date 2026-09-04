import {z} from 'zod'
import {HumanRealtimeEventSchema} from './human-chat.js'
/** Invalidate owner history, never stream provider secrets/tokens or assert human presence. */
export const AiRealtimeEventSchema=z.strictObject({v:z.literal(1),type:z.literal('ai_generation'),eventId:z.uuid(),conversationId:z.uuid(),messageId:z.uuid(),state:z.enum(['generating','partial','failed','completed']),occurredAt:z.iso.datetime()})
export const RealtimeEventSchema=z.union([HumanRealtimeEventSchema,AiRealtimeEventSchema])
export type AiRealtimeEvent=z.infer<typeof AiRealtimeEventSchema>
export type RealtimeEvent=z.infer<typeof RealtimeEventSchema>
